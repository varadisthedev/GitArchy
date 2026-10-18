"""Build the bounded dataset a job runs on, from Git history of repositories the job's owner can read."""
import json

from app.api.dependencies import Context
from app.core.exceptions import AppError, Forbidden, NotFound
from app.integrations.spark.protocol import TASKS
from app.modules.repositories.access import require


class DatasetError(AppError):
    status, code = 422, "dataset_error"


async def build_dataset(ctx: Context, job: dict) -> dict:
    cfg = ctx.settings
    kind = TASKS[job["task_type"]][1]
    commits: list[dict] = []
    files: list[dict] = []
    per_repo: dict[str, dict] = {}
    repo_ids = job["repo_ids"]
    budget = cfg.analytics_max_dataset_rows
    for rid in repo_ids:
        try:  # re-check access at dispatch time: membership may have been revoked since submission
            repo, _ = await require(ctx, job["user_id"], rid, "reader")
        except (NotFound, Forbidden):
            raise DatasetError("A repository is no longer accessible") from None
        if budget <= 0:
            break
        if kind == "files":
            # the tree at the default branch: what the repository holds now, not what changed
            tree = await ctx.git.tree_files(repo["id"], repo["default_branch"], budget)
            budget -= len(tree)
            for f in tree:
                f["repo_id"] = repo["id"]
            files += tree
            continue
        rows = await ctx.git.analytics_log(repo["id"], repo["default_branch"], budget)
        budget -= len(rows)
        for r in rows:
            r["repo_id"] = repo["id"]
        commits += rows
        per_repo[repo["id"]] = {
            "repo_id": repo["id"], "commits": len(rows),
            "additions": sum(r["additions"] for r in rows), "deletions": sum(r["deletions"] for r in rows),
            "files_changed": sum(r["files_changed"] for r in rows), "authors": len({r["author"] for r in rows})}
    data = ({"commits": commits} if kind == "commits"
            else {"files": files} if kind == "files"
            else {"repos": list(per_repo.values())})
    size = len(json.dumps(data))
    if size > cfg.analytics_max_dataset_bytes:
        raise DatasetError("Dataset too large; select fewer repositories")
    n = len(commits) if kind == "commits" else len(files) if kind == "files" else len(per_repo)
    if n == 0:
        raise DatasetError("No data to analyse")
    if job["task_type"] == "repo_clustering_kmeans" and n < job["params"].get("k", 3):
        raise DatasetError("Need at least k repositories for clustering")
    return {"kind": kind, **data, "rows": n}


async def default_repo_ids(ctx: Context, user_id: str, limit: int = 20) -> list[str]:
    return [r["id"] for r in (await ctx.store.list_repos_for_user(user_id))[:limit]]
