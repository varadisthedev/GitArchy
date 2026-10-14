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
