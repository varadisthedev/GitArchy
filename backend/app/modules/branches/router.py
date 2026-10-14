from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.dependencies import AuthUser, Context, current_user, get_ctx
from app.modules.repositories.access import require
from app.utils.validators import validate_branch, validate_ref

router = APIRouter(prefix="/repositories/{repo_id}/branches", tags=["branches"])


class BranchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    from_ref: str | None = Field(None, max_length=100, description="branch or commit id; default branch if omitted")

    _n = field_validator("name")(validate_branch)

    @field_validator("from_ref")
    @classmethod
    def _r(cls, v):
        return validate_ref(v) if v else v


@router.get("")
async def list_branches(repo_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    branches = await ctx.git.list_branches(repo["id"])  # Git is the source of truth
    return [{**b, "is_default": b["name"] == repo["default_branch"]} for b in branches]


@router.post("", status_code=201)
async def create_branch(repo_id: str, body: BranchCreate, auth: AuthUser = Depends(current_user),
                        ctx: Context = Depends(get_ctx)):
    repo, _ = await require(ctx, auth.id, repo_id, "writer")
    sha = await ctx.git.create_branch(repo["id"], body.name, body.from_ref or repo["default_branch"])
    await ctx.store.index_branch(repo["id"], body.name, sha, auth.id)
    await ctx.store.add_event(repo["id"], auth.id, "branch.created", {"branch": body.name})
    return {"name": body.name, "sha": sha}
