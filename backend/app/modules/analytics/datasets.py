"""Build the bounded dataset a job runs on, from Git history of repositories the job's owner can read."""
import json

from app.api.dependencies import Context
from app.core.exceptions import AppError, Forbidden, NotFound
from app.integrations.spark.protocol import TASKS
from app.modules.repositories.access import require


class DatasetError(AppError):
    status, code = 422, "dataset_error"


# Survey caps. Chosen so the dataset lands well under analytics_max_dataset_bytes whatever the
# platform grows to: a survey must never fail for being popular.
SURVEY_MAX_REPOS = 50
SURVEY_MAX_FILES = 40_000
SURVEY_MAX_MESSAGES = 8_000
SURVEY_COMMITS_PER_REPO = 200
# Below this many connected accounts, a reader who is one of them can subtract their own
# repositories from the total and attribute the remainder. Visibility is the only figure that
# discloses something otherwise unknowable - that a private repository exists - so below the floor it
# collapses into one "undisclosed" bucket. The rest of the survey still runs: refusing it outright
# would cost every figure to protect one.
# ponytail: a fixed minimum cell size, no noise. Per-bucket k-anonymity if the platform ever grows.
SURVEY_MIN_ACCOUNTS = 5


async def survey_dataset(ctx: Context) -> dict:
    """Every repository belonging to an account that has connected GitHub, aggregated blind.

    Carries no user id, login, repository name, repository id or path ownership - only visibility,
    file paths and commit subjects. A private repository can therefore be counted without anything
    downstream being able to say whose it is or that it exists.
    """
    accounts = await ctx.store.list_github_users()
    seen: set[str] = set()
    repos: list[dict] = []
    for a in accounts:
        for repo in await ctx.store.list_repos_for_user(a["user_id"]):
            if repo["id"] not in seen:
                seen.add(repo["id"])
                repos.append(repo)
    if not repos:
        raise DatasetError("No repositories from connected GitHub accounts yet")
    repos = repos[:SURVEY_MAX_REPOS]
    per_repo = max(50, SURVEY_MAX_FILES // len(repos))
    files: list[dict] = []
    messages: list[str] = []
    for repo in repos:
        try:
            tree = await ctx.git.tree_files(repo["id"], repo["default_branch"], per_repo)
            log_rows = await ctx.git.analytics_log(repo["id"], repo["default_branch"], SURVEY_COMMITS_PER_REPO)
        except Exception:
            continue  # a repository whose git data is gone simply does not take part
        files += [{"path": f["path"]} for f in tree]
        messages += [c["message"] for c in log_rows]
    disclose = len(accounts) >= SURVEY_MIN_ACCOUNTS
    return {"kind": "survey", "accounts": len(accounts),
            "repos": [{"visibility": r["visibility"] if disclose else "undisclosed"} for r in repos],
            "files": files[:SURVEY_MAX_FILES], "messages": messages[:SURVEY_MAX_MESSAGES],
            "rows": len(repos)}


async def build_dataset(ctx: Context, job: dict) -> dict:
    cfg = ctx.settings
    kind = TASKS[job["task_type"]][1]
    if kind == "survey":
        data = await survey_dataset(ctx)
        if len(json.dumps(data)) > cfg.analytics_max_dataset_bytes:
            raise DatasetError("Survey dataset too large")
        return data
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
