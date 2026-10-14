import time
import uuid

from app.api.dependencies import AuthUser, Context
from app.core.exceptions import Unauthorized
from app.core.security import (create_access_token, hash_password, needs_rehash, verify_password)
from app.integrations.astra.memory import utcnow
from app.modules.auth.schemas import TokenResponse, UserPublic


def public(user: dict) -> UserPublic:
    return UserPublic(id=user["id"], email=user["email"], display_name=user["display_name"],
                      avatar_url=user.get("avatar_url"), created_at=user["created_at"])


async def register(ctx: Context, email: str, password: str, display_name: str) -> UserPublic:
    user = {"id": str(uuid.uuid4()), "email": email, "display_name": display_name,
            "password_hash": hash_password(password), "avatar_url": None, "avatar_public_id": None,
            "created_at": utcnow()}
    await ctx.store.create_user(user)  # raises Conflict(email_taken); atomic via LWT claim
    return public(user)


async def login(ctx: Context, email: str, password: str) -> TokenResponse:
    user = await ctx.store.get_user_by_email(email)
    # always run one Argon2 verification so unknown emails cost the same as wrong passwords
    ok = verify_password(password, user["password_hash"] if user else None)
    if not user or not ok:
        raise Unauthorized("Invalid email or password")
    if needs_rehash(user["password_hash"]):
        await ctx.store.update_user(user["id"], password_hash=hash_password(password))
    token, ttl = create_access_token(ctx.settings, user["id"])
    return TokenResponse(access_token=token, expires_in=ttl, user=public(user))


async def logout(ctx: Context, auth: AuthUser) -> None:
    """Real revocation: the token's jti is stored (with TTL = remaining lifetime) and checked on every request."""
    await ctx.store.revoke_token(auth.claims.jti, int(auth.claims.exp - time.time()) + 1)
