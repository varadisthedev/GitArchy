from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.utils.validators import validate_branch, validate_repo_name


class RepoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=64)
    description: str = Field("", max_length=500)
    visibility: Literal["public", "private"] = "private"
    default_branch: str = Field("main", max_length=100)

    @field_validator("name")
    @classmethod
    def _n(cls, v: str) -> str:
        return validate_repo_name(v)

    @field_validator("default_branch")
    @classmethod
    def _b(cls, v: str) -> str:
        return validate_branch(v)


class RepoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str | None = Field(None, max_length=500)
    visibility: Literal["public", "private"] | None = None


class RepoOut(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str
    visibility: str
    default_branch: str
    created_at: datetime
    updated_at: datetime
    role: str


class MemberSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    role: Literal["reader", "writer", "admin"]


class MemberOut(BaseModel):
    user_id: str
    role: str
    display_name: str | None = None
