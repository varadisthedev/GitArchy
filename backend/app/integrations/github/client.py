"""GitHub REST calls for OAuth sign-in and repository import.

stdlib urllib only (no new dependency). Every call here blocks and must be run via asyncio.to_thread.
URLs are built from settings-controlled hosts with percent-encoded path segments, so caller input never
decides which host is contacted (no SSRF surface), and redirects are refused rather than followed.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import Settings
from app.core.exceptions import AppError

log = logging.getLogger("gitarchey.github")

_API_VERSION = "2022-11-28"  # GitHub pins response shape to this; without it responses can change under us
MAX_REPO_PAGES = 10  # 100 per page -> 1000 repositories


class GitHubError(AppError):
    status, code = 502, "github_error"


class GitHubAuthError(AppError):
    status, code = 401, "github_auth_failed"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A 3xx from the API means we built the wrong URL; never chase it to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _request(url: str, *, token: str | None = None, data: dict | None = None,
             timeout: float = 15.0) -> Any:
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method="POST" if data else "GET")
    req.add_header("Accept", "application/vnd.github+json" if token else "application/json")
    req.add_header("X-GitHub-Api-Version", _API_VERSION)
    req.add_header("User-Agent", "Gitarchey")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with _opener.open(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        detail = e.read()[:200].decode("utf-8", "replace")
        log.warning("github_http_error", extra={"status": e.code, "url": url.split("?")[0]})
        if e.code in (401, 403):
            # the stored token was revoked on GitHub, or its scopes no longer cover this call
            raise GitHubAuthError("GitHub rejected the stored authorization. Reconnect your account.") from None
        if e.code == 404:
            raise GitHubError("Not found on GitHub, or your authorization doesn't cover it",
                              code="github_not_found", status=404) from None
        raise GitHubError(f"GitHub returned {e.code}: {detail[:120]}") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        log.warning("github_unreachable", extra={"url": url.split("?")[0]})
        raise GitHubError("Couldn't reach GitHub. Try again in a moment.", code="github_unreachable") from None


# ---------------------------------------------------------------- oauth
def authorize_url(settings: Settings, state: str, scope: str) -> str:
    q = urllib.parse.urlencode({
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_oauth_redirect_uri,
        "scope": scope,
        "state": state,
        "allow_signup": "true",
    })
    return f"{settings.github_oauth_base}/login/oauth/authorize?{q}"


def exchange_code(settings: Settings, code: str) -> dict:
    """Authorization code -> user access token. Raises GitHubAuthError on a bad or replayed code."""
    payload = _request(
        f"{settings.github_oauth_base}/login/oauth/access_token",
        data={"client_id": settings.github_client_id,
              "client_secret": settings.github_client_secret.get_secret_value(),
              "code": code,
              "redirect_uri": settings.github_oauth_redirect_uri},
        timeout=settings.external_timeout_s,
    )
    if not isinstance(payload, dict) or not payload.get("access_token"):
        # GitHub answers 200 with {"error": "bad_verification_code"} rather than a 4xx
        log.warning("github_token_exchange_failed", extra={"error": (payload or {}).get("error")})
        raise GitHubAuthError("GitHub sign-in could not be completed. Start again.")
    return {"access_token": str(payload["access_token"]), "scope": str(payload.get("scope") or "")}


# ---------------------------------------------------------------- user
def get_viewer(settings: Settings, token: str) -> dict:
    u = _request(f"{settings.github_api_base}/user", token=token, timeout=settings.external_timeout_s)
    if not isinstance(u, dict) or not u.get("id"):
        raise GitHubError("Unexpected response from GitHub")
    return {"github_id": int(u["id"]), "login": str(u["login"]),
            "name": (u.get("name") or "").strip() or str(u["login"]),
            "avatar_url": u.get("avatar_url"), "email": (u.get("email") or "").strip().lower() or None}


def get_verified_email(settings: Settings, token: str) -> str | None:
    """Primary *verified* address, or None. Only a verified address may be matched to an existing account."""
    try:
        emails = _request(f"{settings.github_api_base}/user/emails", token=token,
                          timeout=settings.external_timeout_s)
    except AppError:
        return None  # user:email scope declined -> caller falls back to a noreply address
    if not isinstance(emails, list):
        return None
    chosen = (next((e for e in emails if e.get("primary") and e.get("verified")), None)
              or next((e for e in emails if e.get("verified")), None))
    return str(chosen["email"]).strip().lower() if chosen else None


# ---------------------------------------------------------------- repos
def list_repos(settings: Settings, token: str) -> list[dict]:
    """Every repository the token can read, most recently pushed first. Bounded by MAX_REPO_PAGES."""
    out: list[dict] = []
    for page in range(1, MAX_REPO_PAGES + 1):
        q = urllib.parse.urlencode({"per_page": 100, "page": page, "sort": "pushed",
                                    "affiliation": "owner,collaborator,organization_member"})
        batch = _request(f"{settings.github_api_base}/user/repos?{q}", token=token,
                         timeout=settings.external_timeout_s)
        if not isinstance(batch, list) or not batch:
            break
        out += [_repo(r) for r in batch]
        if len(batch) < 100:
            break
    return out


def get_repo(settings: Settings, token: str, full_name: str) -> dict:
    owner, _, name = full_name.partition("/")
    path = f"{urllib.parse.quote(owner, safe='')}/{urllib.parse.quote(name, safe='')}"
    r = _request(f"{settings.github_api_base}/repos/{path}", token=token,
                 timeout=settings.external_timeout_s)
    if not isinstance(r, dict) or not r.get("full_name"):
        raise GitHubError("Unexpected response from GitHub")
    return _repo(r)


def _repo(r: dict) -> dict:
    return {"full_name": str(r.get("full_name") or ""), "name": str(r.get("name") or ""),
            "owner": str((r.get("owner") or {}).get("login") or ""),
            "description": (r.get("description") or "")[:500],
            "private": bool(r.get("private")), "fork": bool(r.get("fork")),
            "archived": bool(r.get("archived")), "empty": (r.get("size") or 0) == 0,
            "default_branch": str(r.get("default_branch") or "main"),
            "language": r.get("language"), "size_kb": int(r.get("size") or 0),
            "stars": int(r.get("stargazers_count") or 0),
            "pushed_at": r.get("pushed_at"), "clone_url": str(r.get("clone_url") or "")}
