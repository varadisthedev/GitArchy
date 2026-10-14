import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def clean_display_name(v: str) -> str:
    v = v.strip()
    if not v or _CTRL.search(v) or "<" in v or ">" in v:
        raise ValueError("display name must be 1-50 printable characters without < or >")
    return v


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=50)

    _name = field_validator("display_name")(clean_display_name)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic
