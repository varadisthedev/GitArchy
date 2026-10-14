from fastapi import APIRouter, Depends, Request, Response

from app.api.dependencies import AuthUser, Context, current_user, get_ctx, limit_ip
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=201, dependencies=[Depends(limit_ip("register"))])
async def register(body: RegisterRequest, ctx: Context = Depends(get_ctx)):
    return await service.register(ctx, body.email, body.password, body.display_name)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(limit_ip("login"))])
async def login(body: LoginRequest, request: Request, ctx: Context = Depends(get_ctx)):
    # second bucket keyed by target email slows distributed guessing of one account
    if not await ctx.limiter.hit("login", f"email:{body.email.lower()}"):
        from app.core.exceptions import RateLimited
        raise RateLimited("Too many login attempts for this account")
    return await service.login(ctx, body.email, body.password)


@router.post("/logout", status_code=204)
async def logout(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    await service.logout(ctx, auth)
    return Response(status_code=204)
