"""Authorization for every repository-scoped operation. Possessing a repo id grants nothing by itself."""
from app.api.dependencies import Context
from app.core.exceptions import Forbidden, NotFound, Unavailable
from app.utils.validators import parse_uuid

RANK = {"reader": 1, "writer": 2, "admin": 3, "owner": 4}


async def require(ctx: Context, user_id: str, repo_id: str, need: str = "reader", *, need_storage: bool = True):
    """Return (repo, effective_role) or raise.

    - unknown repo, or private repo and caller is not a member -> 404 (no existence leak)
    - member without enough rights, or non-member trying to write a public repo -> 403
    """
    repo_id = parse_uuid(repo_id, "repository id") if repo_id else repo_id
    repo = await ctx.store.get_repo(repo_id)
    if not repo:
        raise NotFound("Repository not found", code="repo_not_found")
    role = await ctx.store.get_role(repo_id, user_id)
    if role is None:
        if repo["visibility"] != "public":
            raise NotFound("Repository not found", code="repo_not_found")
        role = "reader"  # public: any authenticated user can read
    if RANK[role] < RANK[need]:
        raise Forbidden("You do not have permission to perform this action")
    if need_storage and not ctx.storage.exists(repo_id) and not repo.get("storage_key"):
        # the disk is only a cache, so a missing directory is fine as long as a durable copy exists
        # (GitManager pulls it back on the first git command). Neither one means the data is gone.
        raise Unavailable("Repository storage is unavailable", code="repo_storage_unavailable")
    return repo, role
