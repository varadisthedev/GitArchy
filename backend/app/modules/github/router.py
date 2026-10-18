from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies import (AuthUser, Context, current_user, get_ctx, limit_ip, limit_user)
from app.modules.auth.schemas import TokenResponse
from app.modules.github import service
from app.modules.github.schemas import (GithubCallback, GithubImport, GithubRepoOut, GithubStart,
                                        GithubStatus, ImportResult)
from app.modules.repositories.router import out

router = APIRouter(prefix="/github", tags=["github"])


async def _optional_user(request: Request, ctx: Context = Depends(get_ctx)) -> AuthUser | None:
    """The callback serves both flows: anonymous sign-in and linking from a signed-in session."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    from app.api.dependencies import authenticate_token
    from app.core.exceptions import Unauthorized
    try:
        return await authenticate_token(ctx, token.strip())
    except Unauthorized:
        return None  # an expired token must not block signing in with GitHub


@router.post("/oauth/start", dependencies=[Depends(limit_ip("github_oauth"))])
async def oauth_start(body: GithubStart, auth: AuthUser | None = Depends(_optional_user),
                      ctx: Context = Depends(get_ctx)):
    return service.start(ctx, body.mode, body.next, auth.id if auth else None)


@router.post("/oauth/callback", dependencies=[Depends(limit_ip("github_oauth"))])
async def oauth_callback(body: GithubCallback, auth: AuthUser | None = Depends(_optional_user),
                         ctx: Context = Depends(get_ctx)):
    result = await service.callback(ctx, body.code, body.state, body.nonce,
                                   auth.id if auth else None)
    token: TokenResponse | None = result.get("token")
    return {"mode": result["mode"], "login": result.get("login"), "next": result.get("next"),
            "token": token.model_dump() if token else None}


@router.get("/status", response_model=GithubStatus)
async def github_status(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    return await service.status(ctx, auth.id)


@router.delete("/connection", status_code=204)
async def disconnect(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    await service.disconnect(ctx, auth.id)
    return Response(status_code=204)


@router.get("/repositories", response_model=list[GithubRepoOut],
            dependencies=[Depends(limit_user("github_list"))])
async def list_remote(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    return await service.list_remote_repos(ctx, auth.id)


@router.post("/imports", response_model=ImportResult, status_code=201,
             dependencies=[Depends(limit_user("github_import"))])
async def import_one(body: GithubImport, auth: AuthUser = Depends(current_user),
                     ctx: Context = Depends(get_ctx)):
    """One repository per call. The client loops for 'import everything' so progress stays visible."""
    repo, summary = await service.import_repo(ctx, auth, body.full_name, body.visibility)
    return ImportResult(repo=out(repo, "owner"), source=body.full_name,
                        branches=summary["branches"], commits_indexed=summary["commits_indexed"])


@router.post("/imports/{repo_id}/restore", response_model=ImportResult,
             dependencies=[Depends(limit_user("github_import"))])
async def restore_one(repo_id: str, auth: AuthUser = Depends(current_user),
                      ctx: Context = Depends(get_ctx)):
    """Re-clone a repository this server imported and then lost (ephemeral disk)."""
    repo, summary = await service.restore_repo(ctx, auth, repo_id)
    return ImportResult(repo=out(repo, "owner", ctx), source=summary["source"],
                        branches=summary["branches"], commits_indexed=summary["commits_indexed"])
