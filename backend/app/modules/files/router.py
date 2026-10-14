import base64
import binascii
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.api.dependencies import AuthUser, Context, current_user, get_ctx, limit_user
from app.core.exceptions import PayloadTooLarge
from app.modules.repositories.access import require
from app.modules.repositories.router import author_ident
from app.integrations.astra.memory import utcnow
from app.utils.validators import InvalidInput, validate_branch, validate_path, validate_ref

router = APIRouter(prefix="/repositories/{repo_id}", tags=["files"])


@router.get("/tree")
async def tree(repo_id: str, ref: str | None = Query(None, max_length=100), path: str = Query("", max_length=400),
               auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    return await ctx.git.tree(repo["id"], ref or repo["default_branch"], path)


@router.get("/files")
async def read_file(repo_id: str, path: str = Query(..., max_length=400), ref: str | None = Query(None, max_length=100),
                    auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    return await ctx.git.read_file(repo["id"], ref or repo["default_branch"], path)


class FileChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(max_length=400)
    delete: bool = False
    content: str | None = Field(None, max_length=1_500_000)
    encoding: Literal["utf-8", "base64"] = "utf-8"

    _p = field_validator("path")(validate_path)

    @model_validator(mode="after")
    def _check(self):
        if self.delete == (self.content is not None):
            raise ValueError("provide exactly one of: content, or delete=true")
        return self

    def data(self) -> bytes | None:
        if self.delete:
            return None
        if self.encoding == "base64":
            try:
                return base64.b64decode(self.content, validate=True)
            except (binascii.Error, ValueError):
                raise InvalidInput("Invalid base64 content") from None
        return self.content.encode("utf-8")  # exact text preserved; no stripping or rewriting


class CommitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch: str = Field(max_length=100)
    message: str = Field(min_length=1, max_length=2000)
    changes: list[FileChange] = Field(min_length=1, max_length=50)
    expected_parent: str | None = Field(None, description="reject if branch head moved (optimistic concurrency)")

    _b = field_validator("branch")(validate_branch)

    @field_validator("message")
    @classmethod
    def _m(cls, v: str) -> str:
        if "\x00" in v or not v.strip():
            raise ValueError("invalid commit message")
        return v

    @field_validator("expected_parent")
    @classmethod
    def _e(cls, v):
        return validate_ref(v) if v else v


@router.post("/commits", status_code=201, dependencies=[Depends(limit_user("commit"))])
async def create_commit(repo_id: str, body: CommitCreate, auth: AuthUser = Depends(current_user),
                        ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "writer")
    changes = [(c.path, c.data()) for c in body.changes]
    if sum(len(d or b"") for _, d in changes) > ctx.settings.git_max_file_bytes * 5:
        raise PayloadTooLarge("Commit too large", code="commit_too_large")
    name, email = author_ident(auth)
    sha = await ctx.git.commit_files(repo["id"], body.branch, changes, body.message, name, email,
                                     expected_parent=body.expected_parent)
    await ctx.store.index_commit(repo["id"], {"sha": sha, "branch": body.branch, "author_id": auth.id,
                                              "author_name": name, "message": body.message[:200],
                                              "committed_at": utcnow()})
    await ctx.store.add_event(repo["id"], auth.id, "commit.created",
                              {"branch": body.branch, "sha": sha, "files": len(changes),
                               "message": body.message.splitlines()[0][:100]})
    return {"sha": sha, "branch": body.branch}
