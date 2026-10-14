"""Shared FastAPI dependencies: app context, authentication, rate limiting."""
from dataclasses import dataclass, field
from typing import Any, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.core.exceptions import Unauthorized
from app.core.rate_limit import Limiter
from app.core.security import TokenClaims, decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class Context:
    """Everything long-lived, built once in main.lifespan and stored on app.state."""
    settings: Settings
    store: Any
    git: Any
    storage: Any
    limiter: Limiter
    r2: Any = None
    cloudinary: Any = None
    jobs: Any = None
    extra: dict = field(default_factory=dict)


def get_ctx(request: Request) -> Context:
    return request.app.state.ctx


@dataclass
class AuthUser:
    user: dict
    claims: TokenClaims

    @property
    def id(self) -> str:
        return self.user["id"]


async def authenticate_token(ctx: Context, token: str) -> AuthUser:
    """Shared by HTTP (Bearer header) and WebSocket (first message) auth."""
    claims = decode_access_token(ctx.settings, token)
    if await ctx.store.is_token_revoked(claims.jti):
        raise Unauthorized("Invalid or expired token")
    user = await ctx.store.get_user(claims.user_id)
    if not user:
        raise Unauthorized("Invalid or expired token")
    return AuthUser(user, claims)


async def current_user(request: Request, ctx: Context = Depends(get_ctx),
                       creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> AuthUser:
    if creds is None:
        raise Unauthorized("Authentication required")
    auth = await authenticate_token(ctx, creds.credentials)
    request.state.user_id = auth.id
    await ctx.limiter.check("default_authed", request, auth.id)
    return auth


def limit_user(policy: str) -> Callable:
    """Per-user rate limit (also enforces authentication). Use as a route dependency."""
    async def dep(request: Request, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
        await ctx.limiter.check(policy, request, auth.id)
    return dep


def limit_ip(policy: str) -> Callable:
    """Per-client-IP rate limit for anonymous routes (register/login)."""
    async def dep(request: Request, ctx: Context = Depends(get_ctx)):
        await ctx.limiter.check(policy, request)
    return dep
