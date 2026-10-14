from fastapi import APIRouter, Depends, Query

from app.api.dependencies import AuthUser, Context, current_user, get_ctx
from app.modules.repositories.access import require

router = APIRouter(tags=["activity"])


def _ev(e: dict) -> dict:
    return {"id": e["id"], "type": e["type"], "actor_id": e["actor_id"], "repo_id": e["repo_id"],
            "data": e["data"], "ts": e["ts"]}


@router.get("/repositories/{repo_id}/activity")
async def repo_activity(repo_id: str, limit: int = Query(30, ge=1, le=100),
                        auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader", need_storage=False)
    return [_ev(e) for e in await ctx.store.list_repo_events(repo["id"], limit)]


@router.get("/users/me/activity")
async def my_activity(limit: int = Query(30, ge=1, le=100), auth: AuthUser = Depends(current_user),
                      ctx: Context = Depends(get_ctx)):
    return [_ev(e) for e in await ctx.store.list_user_activity(auth.id, limit)]


@router.get("/users/me/notifications")
async def my_notifications(limit: int = Query(30, ge=1, le=100), auth: AuthUser = Depends(current_user),
                           ctx: Context = Depends(get_ctx)):
    return await ctx.store.list_notifications(auth.id, limit)
