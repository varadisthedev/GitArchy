"""Password hashing (Argon2id) and JWT issue/verify."""
import hmac
import time
import uuid
from dataclasses import dataclass

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import Settings
from app.core.exceptions import Unauthorized

_ph = PasswordHasher()  # argon2-cffi defaults to Argon2id
# Verified against when the account doesn't exist, so login timing doesn't reveal registered emails.
_DUMMY_HASH = _ph.hash("gitarchey-dummy-password")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _ph.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _ph.check_needs_rehash(password_hash)


def secrets_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


@dataclass
class TokenClaims:
    user_id: str
    jti: str
    exp: int


def create_access_token(settings: Settings, user_id: str) -> tuple[str, int]:
    now = int(time.time())
    exp = now + settings.jwt_expiry_minutes * 60
    payload = {"sub": user_id, "iat": now, "exp": exp, "jti": uuid.uuid4().hex,
               "iss": settings.jwt_issuer, "aud": settings.jwt_audience}
    token = jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm)
    return token, settings.jwt_expiry_minutes * 60


# ---- OAuth state ----
# The CSRF state is a short-lived signed token instead of a server-side row: it carries its own
# expiry and the flow's intent, so a replayed or attacker-chosen state cannot pass verification
# and no storage has to be cleaned up. Separate audience so it is never usable as an access token.
_STATE_AUD = "gitarchey-oauth-state"


def create_oauth_state(settings: Settings, **claims) -> str:
    now = int(time.time())
    payload = {"iat": now, "exp": now + settings.github_state_ttl_s, "jti": uuid.uuid4().hex,
               "iss": settings.jwt_issuer, "aud": _STATE_AUD, **claims}
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm)


def decode_oauth_state(settings: Settings, state: str) -> dict:
    try:
        return jwt.decode(state, settings.jwt_secret.get_secret_value(), algorithms=[settings.jwt_algorithm],
                          issuer=settings.jwt_issuer, audience=_STATE_AUD,
                          options={"require": ["exp", "iat", "iss", "aud"]})
    except jwt.PyJWTError:
        raise Unauthorized("This sign-in link expired or was tampered with. Start again.",
                           code="oauth_state_invalid") from None


def decode_access_token(settings: Settings, token: str) -> TokenClaims:
    try:
        p = jwt.decode(
            token, settings.jwt_secret.get_secret_value(), algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer, audience=settings.jwt_audience,
            options={"require": ["exp", "iat", "sub", "jti", "iss", "aud"]})
        uuid.UUID(p["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise Unauthorized("Invalid or expired token") from None
    return TokenClaims(user_id=p["sub"], jti=p["jti"], exp=p["exp"])
