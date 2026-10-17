"""GitHub OAuth sign-in/linking and repository import.

Two separate concerns share one OAuth grant:
- identity: the GitHub account is bound to exactly one Gitarchey user (users_by_github_id)
- import: the stored user token clones repositories into Gitarchey's own Git storage

An import is one repository per request. The client drives the loop for "import everything", so
progress is visible without an import-jobs table, a background worker, or polling, and a repository
either lands completely or not at all. See docs for the trade-off this accepts.
"""
import asyncio
import hashlib
import logging
import secrets
import time
import uuid

from app.api.dependencies import AuthUser, Context
from app.core.exceptions import Conflict, Forbidden, Unauthorized, Unavailable
from app.core.security import (create_access_token, create_oauth_state, decode_oauth_state,
                               secrets_equal)
from app.integrations.astra.memory import utcnow
from app.integrations.github import client
from app.modules.auth.schemas import TokenResponse
from app.modules.auth.service import public
from app.utils.validators import InvalidInput, validate_branch, validate_repo_name

log = logging.getLogger("gitarchey.github")

MAX_NAME_ATTEMPTS = 20


def _enabled(ctx: Context) -> None:
    if not ctx.settings.github_configured:
        raise Unavailable("GitHub sign-in and import are not configured on this server",
                          code="integration_not_configured")


# ---------------------------------------------------------------- oauth
def _nonce_hash(nonce: str) -> str:
    return hashlib.sha256(nonce.encode()).hexdigest()


def start(ctx: Context, mode: str, next_: str | None, user_id: str | None) -> dict:
    """Build the GitHub authorize URL. `mode` is 'signin' (anonymous) or 'connect' (bound to user_id).

    The returned nonce binds the flow to the browser that started it: the caller keeps it in
    sessionStorage and must send it back, while the state carries only its hash. Without this a
    signed state is bearer-shaped, and an attacker who completed their own GitHub authorization
    could feed their code+state to someone else's browser and sign them into the attacker's
    account. A cookie would do the same job, but this API is deliberately cookie-free
    (CORS runs with credentials disabled), so the nonce rides in the request body instead.
    """
    _enabled(ctx)
    if mode == "connect" and not user_id:
        raise Forbidden("Sign in before connecting a GitHub account")
    nonce = secrets.token_urlsafe(32)
    state = create_oauth_state(ctx.settings, mode=mode, uid=user_id, next=next_ or None,
                               nh=_nonce_hash(nonce))
    return {"authorize_url": client.authorize_url(ctx.settings, state, ctx.settings.github_scopes),
            "state": state, "nonce": nonce}


async def callback(ctx: Context, code: str, state: str, nonce: str, caller_id: str | None) -> dict:
    """Finish the flow. Returns {"mode": "signin", "token": TokenResponse} or {"mode": "connect", ...}."""
    _enabled(ctx)
    claims = decode_oauth_state(ctx.settings, state)
    mode = claims.get("mode")
    if mode not in ("signin", "connect"):
        raise InvalidInput("Unsupported OAuth flow", code="oauth_state_invalid")
    if not claims.get("nh") or not secrets_equal(_nonce_hash(nonce), str(claims["nh"])):
        raise Unauthorized("This sign-in didn't start in this browser. Start again.",
                           code="oauth_state_invalid")
    # single use: the revoked-token table already stores short-lived jti entries with a TTL, so a
    # replayed state is rejected even while its signature is still inside the expiry window
    jti = str(claims.get("jti") or "")
    if not jti or await ctx.store.is_token_revoked(jti):
        raise Unauthorized("This sign-in link was already used. Start again.",
                           code="oauth_state_invalid")
    await ctx.store.revoke_token(jti, max(int(claims["exp"] - time.time()) + 1, 1))
    if mode == "connect":
        # the state is bound to the user who started it; a token swapped in afterwards cannot redirect it
        if not claims.get("uid") or claims["uid"] != caller_id:
            raise Forbidden("This GitHub authorization was started by a different session")

    grant = await asyncio.to_thread(client.exchange_code, ctx.settings, code)
    token = grant["access_token"]
    viewer = await asyncio.to_thread(client.get_viewer, ctx.settings, token)
    ident = {"github_id": viewer["github_id"], "login": viewer["login"], "access_token": token,
             "scope": grant["scope"], "avatar_url": viewer["avatar_url"], "connected_at": utcnow()}

    if mode == "connect":
        await ctx.store.set_github_identity(caller_id, ident)
        log.info("github_connected", extra={"user_id": caller_id, "login": viewer["login"]})
        return {"mode": "connect", "login": viewer["login"], "next": claims.get("next")}

    user = await _find_or_create_user(ctx, viewer, token)
    await ctx.store.set_github_identity(user["id"], ident)
    access, ttl = create_access_token(ctx.settings, user["id"])
    log.info("github_signin", extra={"user_id": user["id"], "login": viewer["login"]})
    return {"mode": "signin", "next": claims.get("next"),
            "token": TokenResponse(access_token=access, expires_in=ttl, user=public(user))}


async def _find_or_create_user(ctx: Context, viewer: dict, token: str) -> dict:
    """An existing link wins; otherwise a new account. Email never adopts an existing account.

    Matching on email would be a pre-hijack: Gitarchey does not verify the addresses given at
    registration, so anyone can register victim@example.com and wait. The victim's GitHub sign-in
    would then drop them into an account the attacker still holds the password for. Verifying
    GitHub's side is not enough, because the local side is the unverified one. So a taken address is
    refused here and the user links GitHub from a signed-in session instead, which proves they hold
    the local account.
    """
    existing = await ctx.store.get_user_by_github_id(viewer["github_id"])
    if existing:
        return existing

    email = await asyncio.to_thread(client.get_verified_email, ctx.settings, token)
    if email:
        if await ctx.store.get_user_by_email(email):
            raise Conflict(
                "A Gitarchey account already uses this email address. Sign in with your password, "
                "then connect GitHub from Settings to link the two.", code="github_email_taken")
    else:
        # user:email was declined, or no address is verified: never guess, use GitHub's noreply form
        email = f"{viewer['github_id']}+{viewer['login']}@users.noreply.github.com"

    user = {"id": str(uuid.uuid4()), "email": email, "display_name": viewer["name"][:50],
            "password_hash": None,  # OAuth-only account: verify_password() rejects a null hash
            "avatar_url": viewer.get("avatar_url"), "avatar_public_id": None, "created_at": utcnow()}
    await ctx.store.create_user(user)
    return user


async def status(ctx: Context, user_id: str) -> dict:
    if not ctx.settings.github_configured:
        return {"configured": False, "connected": False, "login": None, "avatar_url": None,
                "can_import_private": False}
    ident = await ctx.store.get_github_identity(user_id)
    return {"configured": True, "connected": bool(ident),
            "login": ident["login"] if ident else None,
            "avatar_url": ident["avatar_url"] if ident else None,
            "can_import_private": bool(ident) and "repo" in (ident["scope"] or "").split(",")}


async def disconnect(ctx: Context, user_id: str) -> None:
    """Forget the stored token. Imported repositories are Gitarchey's own and stay untouched."""
    await ctx.store.clear_github_identity(user_id)


async def _identity(ctx: Context, user_id: str) -> dict:
    _enabled(ctx)
    ident = await ctx.store.get_github_identity(user_id)
    if not ident:
        raise Forbidden("Connect your GitHub account first", code="github_not_connected")
    return ident


# ---------------------------------------------------------------- repositories
async def list_remote_repos(ctx: Context, user_id: str) -> list[dict]:
    """GitHub's repositories, each flagged with whether this user already holds that name here."""
    ident = await _identity(ctx, user_id)
    repos = await asyncio.to_thread(client.list_repos, ctx.settings, ident["access_token"])
    mine = {r["name"].lower() for r in await ctx.store.list_repos_for_user(user_id)}
    for r in repos:
        # provenance is not a column on repositories, so "already here" is a name match: it can be
        # wrong if the user renamed an import, which only ever costs them one extra confirmation
        r["imported"] = _local_name(r["name"]).lower() in mine
        r["importable"] = not r["empty"] and r["size_kb"] <= ctx.settings.github_max_repo_kb
    return repos


def _local_name(github_name: str) -> str:
    """GitHub's name mapped onto Gitarchey's stricter rules (must start alphanumeric, <=64 chars)."""
    name = "".join(c for c in github_name if c.isalnum() or c in "._-").lstrip("._-")[:64]
    name = name.rstrip(".") or "imported-repo"
    if name.endswith(".git"):
        name = name[:-4] or "imported-repo"
    return validate_repo_name(name)


async def import_repo(ctx: Context, auth: AuthUser, full_name: str,
                      visibility: str | None = None) -> tuple[dict, dict]:
    """Clone one GitHub repository into Gitarchey. Returns (repo, summary). Atomic: on any failure
    the metadata row and the partial clone are both removed, so a retry is always clean."""
    ident = await _identity(ctx, auth.id)
    gh = await asyncio.to_thread(client.get_repo, ctx.settings, ident["access_token"], full_name)
    if gh["empty"]:
        raise InvalidInput("That repository is empty, so there is nothing to import", code="remote_empty")
    if gh["size_kb"] > ctx.settings.github_max_repo_kb:
        raise InvalidInput(
            f"That repository is {gh['size_kb'] // 1024} MB, over this server's "
            f"{ctx.settings.github_max_repo_kb // 1024} MB import limit", code="repo_too_large")
    if not gh["clone_url"].startswith("https://"):
        # GitHub always answers https; anything else means we are not talking to GitHub
        raise InvalidInput("That repository has an unsupported clone URL", code="unsupported_clone_url")
    try:
        branch = validate_branch(gh["default_branch"])
    except InvalidInput:
        raise InvalidInput("That repository's default branch name is not supported here",
                           code="unsupported_branch") from None

    now = utcnow()
    repo = {"id": str(uuid.uuid4()), "owner_id": auth.id, "name": _local_name(gh["name"]),
            "description": gh["description"] or f"Imported from github.com/{gh['full_name']}",
            # mirror GitHub: public there is already public, private stays private here
            "visibility": visibility or ("private" if gh["private"] else "public"),
            "default_branch": branch, "created_at": now, "updated_at": now}
    await _claim_name(ctx, repo)
    try:
        head = await ctx.git.clone_bare(repo["id"], gh["clone_url"], ident["access_token"])
    except Exception:
        await ctx.store.delete_repo(repo["id"])  # never leave a phantom repository or a blocked name
        ctx.git.delete_repo(repo["id"])
        raise
    try:
        if head != repo["default_branch"]:  # trust the clone's HEAD over the API's default_branch
            repo = await ctx.store.update_repo(repo["id"], default_branch=head, updated_at=utcnow())
        summary = await _index_import(ctx, auth, repo, gh)
    except Exception:
        await ctx.store.delete_repo(repo["id"])
        ctx.git.delete_repo(repo["id"])
        raise
    log.info("github_repo_imported", extra={"repo_id": repo["id"], "user_id": auth.id,
                                            "source": gh["full_name"]})
    return repo, summary


async def _claim_name(ctx: Context, repo: dict) -> None:
    """Take the first free name. Importing a whole profile shouldn't stop at one collision."""
    base = repo["name"]
    for n in range(1, MAX_NAME_ATTEMPTS + 1):
        repo["name"] = base if n == 1 else f"{base[:60]}-{n}"
        try:
            await ctx.store.create_repo(repo)
            return
        except Conflict:
            continue
    raise Conflict(f"You already have repositories named {base} and {base}-2 and so on. "
                   "Rename or delete one, then import again.", code="repo_name_taken")


async def _index_import(ctx: Context, auth: AuthUser, repo: dict, gh: dict) -> dict:
    """Mirror the cloned refs into Cassandra so the UI and activity feed see the history.

    Spark reads Git directly (git.analytics_log), so analytics works off the clone regardless of
    what is indexed here; these rows only back the branch list and commit index in the UI.
    """
    branches = await ctx.git.list_branches(repo["id"])
    for b in branches:
        await ctx.store.index_branch(repo["id"], b["name"], b["sha"], auth.id)
    commits = await ctx.git.log(repo["id"], repo["default_branch"],
                               ctx.settings.github_index_commits)
    for c in commits:
        await ctx.store.index_commit(repo["id"], {
            "sha": c["sha"], "branch": repo["default_branch"],
            "author_id": None,  # the original author is a GitHub user, not a Gitarchey one
            "author_name": c["author_name"], "message": c["message"][:500],
            "committed_at": _parse_iso(c["date"])})
    summary = {"name": repo["name"], "source": gh["full_name"], "private": gh["private"],
               "branches": len(branches), "commits_indexed": len(commits),
               "default_branch": repo["default_branch"]}
    # one event, two tables: the repository's activity page and /activity both pick it up
    await ctx.store.add_event(repo["id"], auth.id, "repo.imported", summary)
    return summary


def _parse_iso(value: str):
    from datetime import datetime, timezone
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return utcnow()
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
