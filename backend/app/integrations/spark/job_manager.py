"""Analytics job coordination: persisted state machine, worker registry, dispatch, retries, watchdog.

Every transition is written to the store first (Astra in production), so jobs survive API restarts:
on startup, non-terminal jobs are put back to `queued` and re-dispatched when a worker connects.
Worker connections themselves are in-memory and per API process (documented limitation).
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.core.config import Settings
from app.core.exceptions import AppError, Conflict
from app.integrations.astra.memory import utcnow
from app.integrations.spark import protocol as P

log = logging.getLogger("gitarchey.analytics")

ALLOWED = {
    "queued": {"dispatched", "cancelled", "failed"},
    "dispatched": {"running", "queued", "succeeded", "failed"},
    "running": {"succeeded", "failed", "queued"},
    "succeeded": set(), "failed": set(), "cancelled": set(),
}
MAX_RESULT_BYTES = 1_000_000
START_GRACE_S = 60  # dispatched job must report job_started within this


def can_transition(a: str, b: str) -> bool:
    return b in ALLOWED.get(a, set())


class QuotaExceeded(AppError):
    status, code = 429, "analytics_quota_exceeded"


@dataclass
class WorkerConn:
    id: str
    ws: object  # needs: async send_json(dict), async close(code)
    tasks: set[str]
    last_seen: float = field(default_factory=time.monotonic)
    ready: bool = False
    job_id: str | None = None
    dispatched_at: float = 0.0


DatasetBuilder = Callable[[dict], Awaitable[dict]]


class JobManager:
    MAX_WORKERS = 3

    def __init__(self, store, settings: Settings, dataset_builder: DatasetBuilder):
        self.store, self.cfg, self.build_dataset = store, settings, dataset_builder
        self.workers: dict[str, WorkerConn] = {}
        self.subs: dict[str, set[asyncio.Queue]] = {}
        self._sched_lock = asyncio.Lock()
        self._watchdog: asyncio.Task | None = None

    # ------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        for j in await self.store.list_open_jobs():
            if j["status"] != "queued":  # was in flight when the API went down
                await self._set(j["id"], "queued", error=None)
        self._watchdog = asyncio.create_task(self._watch(), name="analytics-watchdog")

    async def stop(self) -> None:
        if self._watchdog:
            self._watchdog.cancel()
        for w in list(self.workers.values()):
            try:
                await w.ws.close(1001)
            except Exception:
                pass

    @property
    def worker_available(self) -> bool:
        return any(w.ready for w in self.workers.values())

    # ------------------------------------------------------------ state
    async def _set(self, job_id: str, status: str, **fields) -> dict | None:
        cur = await self.store.get_job(job_id)
        if not cur or not can_transition(cur["status"], status):
            log.warning("job_transition_rejected", extra={"job_id": job_id,
                                                          "from": cur and cur["status"], "to": status})
            return None
        if status in P.TERMINAL:
            fields.setdefault("finished_at", utcnow())
        job = await self.store.update_job(job_id, status=status, **fields)
        log.info("job_transition", extra={"job_id": job_id, "from": cur["status"], "to": status,
                                          "attempts": job["attempts"]})
        await self._publish(job_id, {"type": "status", "status": status, "error": job.get("error")})
        return job

    async def _publish(self, job_id: str, event: dict) -> None:
        for q in list(self.subs.get(job_id, ())):
            if q.full():
                q.get_nowait()
            q.put_nowait(event)

    def subscribe(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.subs.setdefault(job_id, set()).add(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        self.subs.get(job_id, set()).discard(q)
        if not self.subs.get(job_id):
            self.subs.pop(job_id, None)

    # ------------------------------------------------------------ submit
    async def submit(self, job: dict) -> tuple[dict, bool]:
        """Idempotent by job id. Returns (job, created)."""
        existing = await self.store.get_job(job["id"])
        if existing:
            if existing["user_id"] != job["user_id"]:
                raise Conflict("Job id already in use")  # never reveal or return another user's job
            return existing, False
        mine = [j for j in await self.store.list_open_jobs() if j["user_id"] == job["user_id"]]
        if len(mine) >= self.cfg.analytics_max_concurrent_per_user:
            raise QuotaExceeded("Too many active analytics jobs")
        created = await self.store.create_job(job)
        if not created:  # lost a race with a concurrent identical submit
            return await self.store.get_job(job["id"]), False
        await self.schedule()
        return await self.store.get_job(job["id"]), True

    async def cancel(self, job_id: str) -> dict | None:
        return await self._set(job_id, "cancelled")  # only queued jobs can be cancelled (see ALLOWED)

    # ------------------------------------------------------------ workers
    async def register(self, w: WorkerConn) -> None:
        old = self.workers.get(w.id)
        self.workers[w.id] = w
        log.info("worker_connected", extra={"worker_id": w.id, "workers": len(self.workers)})
        if old:  # same worker id reconnecting: drop the stale socket, requeue its job
            await self._lost(old, "replaced")
            try:
                await old.ws.close(1000)
            except Exception:
                pass

    async def unregister(self, w: WorkerConn, reason: str) -> None:
        if self.workers.get(w.id) is w:
            del self.workers[w.id]
            log.info("worker_disconnected", extra={"worker_id": w.id, "reason": reason})
            await self._lost(w, reason)

    async def _lost(self, w: WorkerConn, reason: str) -> None:
        """Requeue (or fail, when attempts are exhausted) the job a vanished worker was holding."""
        if not w.job_id:
            return
        jid, w.job_id = w.job_id, None
        job = await self.store.get_job(jid)
        if not job or job["status"] not in ("dispatched", "running"):
            return
        if job["attempts"] < self.cfg.analytics_max_attempts:
            await self._set(jid, "queued", error=f"worker_lost:{reason}")
            await self.schedule()
        else:
            await self._set(jid, "failed", error="worker_lost: retries exhausted")

    # ------------------------------------------------------------ scheduling
    async def schedule(self) -> None:
        async with self._sched_lock:
            running = sum(1 for w in self.workers.values() if w.job_id)
            if running >= self.cfg.analytics_max_concurrent_total:
                return
            queued = sorted((j for j in await self.store.list_open_jobs() if j["status"] == "queued"),
                            key=lambda j: j["created_at"])
            for job in queued:
                free = next((w for w in self.workers.values()
                             if w.ready and not w.job_id and job["task_type"] in (w.tasks or {job["task_type"]})), None)
                if not free or running >= self.cfg.analytics_max_concurrent_total:
                    break
                if await self._dispatch(free, job):
                    running += 1

    async def _dispatch(self, w: WorkerConn, job: dict) -> bool:
        try:
            dataset = await self.build_dataset(job)
        except Exception as e:  # dataset problems are the job's fault, not the worker's
            msg = e.message if isinstance(e, AppError) else "could not build dataset"
            await self._set(job["id"], "dispatched", attempts=job["attempts"] + 1)
            await self._set(job["id"], "failed", error=msg[:300])
            return False
        moved = await self._set(job["id"], "dispatched", attempts=job["attempts"] + 1, error=None)
        if not moved:
            return False
        w.job_id, w.dispatched_at = job["id"], time.monotonic()
        try:
            await w.ws.send_json(P.job_dispatch(job["id"], job["task_type"], job["params"], dataset,
                                                self.cfg.analytics_max_job_seconds))
        except Exception:
            await self.unregister(w, "send_failed")
            return False
        return True

    # ------------------------------------------------------------ worker messages
    async def on_message(self, w: WorkerConn, msg) -> None:
        w.last_seen = time.monotonic()
        t = msg.type
        if t == "heartbeat":
            return
        if t == "worker_ready":
            w.ready = True
            await self.schedule()
            return
        if t == "worker_shutdown":
            w.ready = False
            return
        # job-scoped messages: ignore anything that isn't the job this worker currently holds (idempotent)
        if getattr(msg, "job_id", None) != w.job_id:
            log.warning("stale_job_message", extra={"worker_id": w.id, "type": t})
            return
        jid = msg.job_id
        if t == "job_started":
            await self._set(jid, "running", started_at=utcnow())
        elif t == "job_progress":
            await self._publish(jid, {"type": "progress", "percent": msg.percent, "message": msg.message})
        elif t == "job_completed":
            await self._complete(w, msg)
        elif t == "job_failed":
            w.job_id = None
            await self._set(jid, "failed", error=msg.error[:500])
            await self.schedule()

    async def _complete(self, w: WorkerConn, msg: P.JobCompleted) -> None:
        jid, w.job_id = msg.job_id, None
        if len(json.dumps(msg.result, default=str)) > MAX_RESULT_BYTES:
            await self._set(jid, "failed", error="result too large")
            await self.schedule()
            return
        job = await self.store.get_job(jid)
        started = job.get("started_at") or job["created_at"]
        metrics = {**msg.metrics, "queue_wait_s": round((started - job["created_at"]).total_seconds(), 2),
                   "wall_s": round((utcnow() - started).total_seconds(), 2), "worker_id": w.id}
        done = await self._set(jid, "succeeded", result=msg.result, metrics=metrics, error=None)
        if done and job["task_type"] in P.GLOBAL_TASKS:
            # the survey is platform-wide and expensive; cache it so the page renders with no worker
            await self.store.save_survey(jid, msg.result)
        if done and len(job["repo_ids"]) == 1:
            # only a single-repository run is attributable. A job over several produces ONE aggregate,
            # and storing it against each would show repository B's figures on repository A's page to
            # anyone who can read A. The job's scope is the server's own record, not the worker's count.
            summary = json.dumps(msg.result, default=str)
            await self.store.add_repo_result(job["repo_ids"][0], jid, job["task_type"],
                                             msg.result if len(summary) < 8000 else {"truncated": True})
        await self.schedule()

    # ------------------------------------------------------------ watchdog
    async def _watch(self) -> None:
        while True:
            try:
                await asyncio.sleep(min(5.0, self.cfg.worker_heartbeat_interval_s))
                await self.sweep()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("watchdog_error")

    async def sweep(self) -> None:
        now = time.monotonic()
        for w in list(self.workers.values()):
            if now - w.last_seen > self.cfg.worker_heartbeat_timeout_s:
                log.warning("worker_heartbeat_timeout", extra={"worker_id": w.id})
                await self.unregister(w, "heartbeat_timeout")
                try:
                    await w.ws.close(1011)
                except Exception:
                    pass
                continue
            if not w.job_id:
                continue
            job = await self.store.get_job(w.job_id)
            if not job:
                continue
            age = now - w.dispatched_at
            if job["status"] == "dispatched" and age > START_GRACE_S:
                await self.unregister(w, "start_timeout")
            elif job["status"] == "running" and age > self.cfg.analytics_max_job_seconds + 30:
                jid, w.job_id = w.job_id, None
                await self._set(jid, "failed", error="exceeded max job duration")
                try:
                    await w.ws.close(1011)  # worker is probably wedged; it will reconnect
                except Exception:
                    pass
