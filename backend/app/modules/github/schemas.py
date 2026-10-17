from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.repositories.schemas import RepoOut

# owner/name as GitHub allows it; the owner and repo segments never reach a shell or a path
_FULL_NAME_MAX = 256


class GithubStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["signin", "connect"] = "signin"
    next: str | None = Field(None, max_length=512)

    @field_validator("next")
    @classmethod
    def _safe_next(cls, v: str | None) -> str | None:
        """Same-origin paths only: this value comes back as a post-sign-in redirect target."""
        if v is None:
            return None
        if not v.startswith("/") or v.startswith("//") or "\\" in v or any(ord(c) < 32 for c in v):
            return None
        return v


class GithubCallback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=4096)
    # proves the flow started in this browser; the state holds only its hash
    nonce: str = Field(min_length=1, max_length=256)


class GithubStatus(BaseModel):
    configured: bool
    connected: bool
    login: str | None = None
    avatar_url: str | None = None
    can_import_private: bool = False


class GithubRepoOut(BaseModel):
    full_name: str
    name: str
    owner: str
    description: str
    private: bool
    fork: bool
    archived: bool
    empty: bool
    default_branch: str
    language: str | None = None
    size_kb: int
    stars: int
    pushed_at: str | None = None
    imported: bool = False
    importable: bool = True


class GithubImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=3, max_length=_FULL_NAME_MAX)
    # omitted => mirror GitHub's own visibility
    visibility: Literal["public", "private"] | None = None

    @field_validator("full_name")
    @classmethod
    def _owner_slash_name(cls, v: str) -> str:
        owner, slash, name = v.strip().partition("/")
        ok = (slash and owner and name and "/" not in name
              and all(c.isalnum() or c in "._-" for c in owner + name))
        if not ok:
            raise ValueError("full_name must be owner/repository")
        return f"{owner}/{name}"


class ImportResult(BaseModel):
    repo: RepoOut
    source: str
    branches: int
    commits_indexed: int
