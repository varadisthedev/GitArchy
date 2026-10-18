import logging
import uuid

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import AuthUser, Context, current_user, get_ctx, limit_user
from app.core.exceptions import Forbidden, NotFound
from app.integrations.astra.memory import utcnow
from app.modules.repositories.access import RANK, require
from app.modules.repositories.schemas import (MemberOut, MemberSet, RepoCreate, RepoOut, RepoUpdate)
from app.utils.validators import parse_uuid

log = logging.getLogger("gitarchey.repos")
router = APIRouter(prefix="/repositories", tags=["repositories"])


def author_ident(auth: AuthUser) -> tuple[str, str]:
    return auth.user["display_name"], f"{auth.id}@users.noreply.gitarchey.local"


def out(repo: dict, role: str, ctx: Context | None = None) -> RepoOut:
    """`ctx` adds storage_missing: one stat() per repository, so the UI can offer a restore
    instead of showing a wall of 503s when the host's disk was wiped."""
    return RepoOut(**{k: repo[k] for k in ("id", "owner_id", "name", "description", "visibility",
                                           "default_branch", "created_at", "updated_at")}, role=role,
                   source=repo.get("source"),
                   storage_missing=bool(ctx) and not ctx.storage.exists(repo["id"]))


@router.post("", response_model=RepoOut, status_code=201, dependencies=[Depends(limit_user("repo_create"))])
async def create_repo(body: RepoCreate, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    now = utcnow()
    repo = {"id": str(uuid.uuid4()), "owner_id": auth.id, "name": body.name, "description": body.description,
            "visibility": body.visibility, "default_branch": body.default_branch,
            "created_at": now, "updated_at": now}
    await ctx.store.create_repo(repo)  # claims (owner, name) first -> Conflict on duplicates
    try:
        readme = f"# {body.name}\n\n{body.description}\n".encode()
        name, email = author_ident(auth)
        sha = await ctx.git.init_repo(repo["id"], body.default_branch, readme, name, email)
    except Exception:
        # roll back so a failed init never leaves a phantom repository / blocked name
        await ctx.store.delete_repo(repo["id"])
        ctx.git.delete_repo(repo["id"])
        raise
    await ctx.store.index_branch(repo["id"], body.default_branch, sha, auth.id)
    await ctx.store.add_event(repo["id"], auth.id, "repo.created", {"name": body.name})
    return out(repo, "owner")


@router.get("", response_model=list[RepoOut])
async def list_repos(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0, le=10_000),
                     auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repos = await ctx.store.list_repos_for_user(auth.id)
    return [out(r, r["role"], ctx) for r in repos[offset: offset + limit]]


@router.get("/{repo_id}", response_model=RepoOut)
async def get_repo(repo_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, role = await require(ctx, auth.id, repo_id, "reader", need_storage=False)
    return out(repo, role, ctx)


@router.patch("/{repo_id}", response_model=RepoOut)
async def update_repo(repo_id: str, body: RepoUpdate, auth: AuthUser = Depends(current_user),
                      ctx: Context = Depends(get_ctx)):
    repo, role = await require(ctx, auth.id, repo_id, "admin", need_storage=False)
    fields = body.model_dump(exclude_none=True)
    if "visibility" in fields and role != "owner":
        raise Forbidden("Only the owner can change visibility")
    if fields:
        repo = await ctx.store.update_repo(repo["id"], **fields, updated_at=utcnow())
        await ctx.store.add_event(repo["id"], auth.id, "repo.updated", {"fields": sorted(fields)})
    return out(repo, role)


@router.delete("/{repo_id}", status_code=204, dependencies=[Depends(limit_user("repo_delete"))])
async def delete_repo(repo_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "owner", need_storage=False)
    async with ctx.git.lock(repo["id"]):
        await ctx.store.delete_repo(repo["id"])  # metadata first; a leftover directory is harmless garbage
        ctx.git.delete_repo(repo["id"])
    log.info("repo_deleted", extra={"repo_id": repo["id"], "user_id": auth.id})
    return Response(status_code=204)


# ---- collaborators ----
@router.get("/{repo_id}/members", response_model=list[MemberOut])
async def list_members(repo_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader", need_storage=False)
    res = []
    for m in await ctx.store.list_members(repo["id"]):
        u = await ctx.store.get_user(m["user_id"])
        res.append(MemberOut(user_id=m["user_id"], role=m["role"], display_name=u["display_name"] if u else None))
    return res


@router.put("/{repo_id}/members", response_model=MemberOut)
async def set_member(repo_id: str, body: MemberSet, auth: AuthUser = Depends(current_user),
                     ctx: Context = Depends(get_ctx)):
    repo, role = await require(ctx, auth.id, repo_id, "admin", need_storage=False)
    if body.role == "admin" and role != "owner":
        raise Forbidden("Only the owner can grant admin")
    target = await ctx.store.get_user_by_email(body.email)
    if not target:
        raise NotFound("User not found", code="user_not_found")
    existing = await ctx.store.get_role(repo["id"], target["id"])
    if existing == "owner":
        raise Forbidden("Cannot change the owner's role")
    if existing == "admin" and role != "owner":
        raise Forbidden("Only the owner can modify an admin")
    await ctx.store.set_member(repo["id"], target["id"], body.role)
    await ctx.store.add_event(repo["id"], auth.id, "member.set", {"user_id": target["id"], "role": body.role})
    await ctx.store.add_notification(target["id"], "repo.invited", {"repo_id": repo["id"], "role": body.role})
    return MemberOut(user_id=target["id"], role=body.role, display_name=target["display_name"])


@router.delete("/{repo_id}/members/{user_id}", status_code=204)
async def remove_member(repo_id: str, user_id: str, auth: AuthUser = Depends(current_user),
                        ctx: Context = Depends(get_ctx)):
    repo, role = await require(ctx, auth.id, repo_id, "reader", need_storage=False)
    user_id = parse_uuid(user_id, "user id")
    target_role = await ctx.store.get_role(repo["id"], user_id)
    if target_role is None:
        raise NotFound("Member not found", code="member_not_found")
    if target_role == "owner":
        raise Forbidden("The owner cannot be removed")
    leaving = user_id == auth.id  # anyone may leave; removing others needs admin (> target)
    if not leaving and (RANK[role] < RANK["admin"] or RANK[role] <= RANK[target_role]):
        raise Forbidden("You do not have permission to remove this member")
    await ctx.store.remove_member(repo["id"], user_id)
    await ctx.store.add_event(repo["id"], auth.id, "member.removed", {"user_id": user_id})
    return Response(status_code=204)
