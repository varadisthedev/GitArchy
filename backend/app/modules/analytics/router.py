import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.dependencies import AuthUser, Context, authenticate_token, current_user, get_ctx, limit_user
from app.core.exceptions import AppError, Conflict, NotFound, Unavailable
from app.integrations.astra.memory import utcnow
from app.integrations.spark.job_manager import QuotaExceeded
from app.integrations.spark.protocol import GLOBAL_TASKS, TASKS, TERMINAL, TaskType
from app.modules.analytics.datasets import default_repo_ids
from app.modules.repositories.access import require
from app.utils.validators import InvalidInput, parse_uuid

log = logging.getLogger("gitarchey.analytics")
router = APIRouter(prefix="/analytics", tags=["analytics"])
SURVEY_HISTORY = 24  # runs charted on /survey; a survey is a manual act, so this is months of them
SURVEY_MIN_INTERVAL_S = 6 * 3600


def survey_shares(result: dict) -> dict:
    """A past run, as the shares a chart needs and nothing else.

    Counts are what make two runs subtractable. "private: 7" beside "private: 8" an hour later names
    the hour a private repository appeared, and the language counts beside them say what is in it.
    The newest run still carries its totals - they are the page's headline - but one set of current
    figures cannot be differenced against anything.
    """
    return {k: [{"label": g["label"], "share": g["share"]} for g in result.get(k) or []]
            for k in ("languages", "visibility", "message_lengths")}


async def survey_cooldown(ctx: Context) -> None:
    """Space survey runs out once private repositories are inside them.

    SURVEY_MIN_ACCOUNTS makes any one result safe to publish. It says nothing about the difference
    between two, and a caller who can measure whenever they like can bracket somebody else's
    afternoon and read the change straight off the delta. Below the floor the survey is public data
    only, so there is nothing a delta could disclose and no reason to make anyone wait.
    """
    newest = await ctx.store.get_survey()
    if not newest:
        return
    private = any(g["label"] != "public" and g["count"] > 0
                  for g in newest["result"].get("visibility") or [])
    waited = (utcnow() - newest["measured_at"]).total_seconds()
    if private and waited < SURVEY_MIN_INTERVAL_S:
        raise QuotaExceeded(f"The survey can run again in "
                            f"{int((SURVEY_MIN_INTERVAL_S - waited) // 60) + 1} minutes")


class JobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_type: TaskType
    params: dict = Field(default_factory=dict)
    repo_ids: list[str] | None = Field(None, max_length=20, description="defaults to your repositories")
    job_id: str | None = Field(None, description="client-chosen UUID; resubmitting the same id is idempotent")

    @field_validator("repo_ids")
    @classmethod
    def _r(cls, v):
        return [parse_uuid(x, "repository id") for x in dict.fromkeys(v)] if v is not None else v

    @field_validator("job_id")
    @classmethod
    def _j(cls, v):
        return parse_uuid(v, "job id") if v else v


def job_out(job: dict, worker_available: bool | None = None) -> dict:
    out = {k: job[k] for k in ("id", "task_type", "params", "repo_ids", "status", "attempts", "error",
                               "metrics", "created_at", "updated_at", "started_at", "finished_at")}
    if worker_available is not None and job["status"] == "queued":
        out["worker_available"] = worker_available
        if not worker_available:
            out["status_detail"] = "worker_unavailable"  # stays queued; dispatched when a worker connects
    return out


def _jobs(ctx: Context):
    if not ctx.jobs:
        raise Unavailable("Analytics is disabled", code="analytics_disabled")
    return ctx.jobs


async def _own_job(ctx: Context, auth: AuthUser, job_id: str) -> dict:
    job = await ctx.store.get_job(parse_uuid(job_id, "job id"))
    if not job or job["user_id"] != auth.id:  # 404 either way: don't reveal other users' job ids
        raise NotFound("Job not found", code="job_not_found")
    return job


@router.post("/jobs", status_code=202, dependencies=[Depends(limit_user("analytics_submit"))])
async def submit(body: JobCreate, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    jm = _jobs(ctx)
    params_model, _ = TASKS[body.task_type]
    try:
        params = params_model(**body.params).model_dump()  # strict: unknown keys rejected
    except Exception:
        raise InvalidInput(f"Invalid params for {body.task_type}") from None
    if body.task_type in GLOBAL_TASKS:
        await survey_cooldown(ctx)
        # platform-wide scope. There is no repository list to authorise against, and none is needed:
        # the dataset is aggregate-only, so the result cannot disclose a repository to anyone.
        # Params are the server's, not the caller's: this result is cached and served to every other
        # reader, so one submitter must not get to choose how much of it everybody else sees.
        repo_ids, params = [], params_model().model_dump()
    else:
        repo_ids = body.repo_ids if body.repo_ids is not None else await default_repo_ids(ctx, auth.id)
        if not repo_ids:
            raise InvalidInput("No repositories to analyse")
        for rid in repo_ids:
            await require(ctx, auth.id, rid, "reader")
    job = {"id": body.job_id or str(uuid.uuid4()), "user_id": auth.id, "task_type": body.task_type,
           "params": params, "repo_ids": repo_ids, "status": "queued", "attempts": 0, "error": None,
           "result": None, "metrics": None, "created_at": utcnow(), "updated_at": utcnow(),
           "started_at": None, "finished_at": None}
    saved, created = await jm.submit(job)
    return job_out(saved, jm.worker_available) | {"created": created}


@router.get("/jobs")
async def list_jobs(limit: int = Query(20, ge=1, le=100), auth: AuthUser = Depends(current_user),
                    ctx: Context = Depends(get_ctx)):
    return [job_out(j) for j in await ctx.store.list_jobs_for_user(auth.id, limit)]


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    job = await _own_job(ctx, auth, job_id)
    return job_out(job, ctx.jobs.worker_available if ctx.jobs else False)


@router.get("/jobs/{job_id}/results")
async def get_results(job_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    job = await _own_job(ctx, auth, job_id)
    if job["status"] != "succeeded":
        raise Conflict(f"Job is {job['status']}", code="results_not_ready")
    return {"job_id": job["id"], "task_type": job["task_type"], "result": job["result"], "metrics": job["metrics"]}


@router.get("/repositories/{repo_id}/languages")
async def repo_languages(repo_id: str, auth: AuthUser = Depends(current_user),
                         ctx: Context = Depends(get_ctx)):
    """The most recent language breakdown computed for THIS repository alone.

    Attribution is the job manager's job: it records a result against a repository only when that
    repository was the job's whole scope. The `repos` check below is not a second control - the worker
    reports that number - it only hides rows written before attribution was narrowed.
    """
    repo, _ = await require(ctx, auth.id, repo_id, "reader", need_storage=False)
    for r in await ctx.store.list_repo_results(repo["id"], 20):
        summary = r["summary"] or {}
        if r["task_type"] == "language_breakdown" and summary.get("repos") == 1:
            return {"result": summary, "job_id": r["job_id"], "finished_at": r["finished_at"]}
    return {"result": None, "job_id": None, "finished_at": None}


@router.get("/survey")
async def survey(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    """The newest platform survey, served from cache so the page is never blank.

    Aggregate figures only - no user, login or repository ever appears in the stored result - so any
    signed-in reader may see it. Signed-in, though: figures drawn from every connected account are
    not the anonymous internet's to read, and `auth` is what makes the sentence above true.
    """
    runs = await ctx.store.list_surveys(SURVEY_HISTORY)
    newest = runs[0] if runs else None
    return {"result": newest["result"] if newest else None,
            "job_id": newest["job_id"] if newest else None,
            "measured_at": newest["measured_at"] if newest else None,
            # oldest first: the shape a chart reads left to right
            "history": [{"measured_at": r["measured_at"], **survey_shares(r["result"])} for r in reversed(runs)],
            "worker_available": bool(ctx.jobs and ctx.jobs.worker_available)}


@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    job = await _own_job(ctx, auth, job_id)
    done = await _jobs(ctx).cancel(job["id"])
    if not done:
        raise Conflict("Only queued jobs can be cancelled", code="not_cancellable")
    return job_out(done)


@router.websocket("/jobs/{job_id}/stream")
async def stream(ws: WebSocket, job_id: str):
    """Live progress for the job's owner. First client message must be {"type":"auth","token":"<JWT>"}
    (token kept out of the URL so it never lands in access logs)."""
    ctx: Context = ws.app.state.ctx
    try:
        await ctx.limiter.check("ws_connect", ws)
    except AppError:
        await ws.close(1008)
        return
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), 5)
        if first.get("type") != "auth" or not isinstance(first.get("token"), str):
            raise ValueError
        auth = await authenticate_token(ctx, first["token"])
        job = await _own_job(ctx, auth, job_id)
    except (AppError, ValueError, asyncio.TimeoutError, WebSocketDisconnect, KeyError, TypeError):
        await ws.close(1008)
        return
    jm = ctx.jobs
    q = jm.subscribe(job["id"]) if jm else None
    try:
        await ws.send_json({"type": "snapshot", **{k: job[k] for k in ("status", "error")}})
        if job["status"] in TERMINAL or q is None:
            return
        while True:
            ev = await q.get()
            await ws.send_json(ev)
            if ev["type"] == "status" and ev["status"] in TERMINAL:
                return
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if jm and q:
            jm.unsubscribe(job["id"], q)
        try:
            await ws.close()
        except Exception:
            pass
