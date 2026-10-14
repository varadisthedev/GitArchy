from fastapi import APIRouter, Depends, Query

from app.api.dependencies import AuthUser, Context, current_user, get_ctx
from app.modules.repositories.access import require

router = APIRouter(prefix="/repositories/{repo_id}", tags=["commits"])


@router.get("/commits")
async def history(repo_id: str, ref: str | None = Query(None, max_length=100),
                  path: str | None = Query(None, max_length=400),
                  limit: int = Query(30, ge=1, le=100), skip: int = Query(0, ge=0, le=100_000),
                  auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    return await ctx.git.log(repo["id"], ref or repo["default_branch"], limit, skip, path)


@router.get("/diff")
async def diff(repo_id: str, base: str = Query(..., max_length=100), head: str = Query(..., max_length=100),
               path: str | None = Query(None, max_length=400),
               auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    return await ctx.git.diff(repo["id"], base, head, path)
