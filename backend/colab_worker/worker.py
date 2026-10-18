"""Gitarchey Spark worker. Connects OUT to the backend over WSS, so Colab never needs to be reachable.

Run in a notebook:   from worker import start_in_background; start_in_background(URL, TOKEN)
Run as a script:     GITARCHEY_WS_URL=wss://api.example.com/api/v1/workers/spark/connect \
                     GITARCHEY_WORKER_TOKEN=... python worker.py

Resilience: reconnects forever with exponential backoff + jitter; abandons the running job when the socket drops
(the backend requeues it); sends app-level heartbeats the backend uses to detect a dead worker.
"""
import asyncio
import json
import logging
import math
import os
import platform
import random
import sys
import threading
import time

import websockets

from tasks import TASKS, TaskError  # noqa: E402  (same folder)

PROTOCOL_VERSION = 1
log = logging.getLogger("gitarchey.worker")
MAX_FRAME = 8_000_000  # backend sends the dataset inside job_dispatch (capped server-side at ~5 MB)


def _jsonable(o):
    """Spark/numpy values -> plain JSON."""
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [_jsonable(v) for v in o]
    if hasattr(o, "item"):  # numpy scalar
        return _jsonable(o.item())
    if isinstance(o, float) and not math.isfinite(o):   # NaN/inf are not JSON
        return None
    return o


def make_spark():
    from pyspark.sql import SparkSession
    # driver and executors must run the same interpreter; a stale PYSPARK_PYTHON breaks every task
    os.environ["PYSPARK_PYTHON"] = sys.executable
    os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
    spark = (SparkSession.builder.master("local[*]").appName("gitarchey-worker")
             .config("spark.ui.enabled", "false").config("spark.sql.shuffle.partitions", "8")
             .config("spark.driver.memory", os.getenv("SPARK_DRIVER_MEMORY", "2g")).getOrCreate())
    spark.sparkContext.setLogLevel("ERROR")
    return spark


def msg(type_: str, **kw) -> str:
    return json.dumps({"v": PROTOCOL_VERSION, "type": type_, **kw})


class Worker:
    def __init__(self, url: str, token: str, worker_id: str | None = None, spark_factory=make_spark):
        if not url.startswith(("wss://", "ws://")):
            raise ValueError("url must be ws:// or wss://")
        self.url, self.token = url, token
        self.worker_id = worker_id or f"colab-{platform.node()[:20]}-{os.getpid()}".replace(" ", "-")
        self._spark_factory, self._spark = spark_factory, None
        self.stop_event = threading.Event()
        self.jobs_done = 0

    # ------------------------------------------------------------ main loop
    async def run_forever(self) -> None:
        self._spark = await asyncio.to_thread(self._spark_factory)   # warm Spark BEFORE announcing ready
        attempt = 0
        while not self.stop_event.is_set():
            try:
                await self._session()
                attempt = 0                                          # clean close: reconnect promptly
            except (OSError, websockets.WebSocketException, asyncio.TimeoutError) as e:
                log.warning("connection lost: %s", type(e).__name__)
            attempt += 1
            delay = min(60.0, 2.0 ** min(attempt, 6)) * random.uniform(0.5, 1.0)
            log.info("reconnecting in %.1fs", delay)
            for _ in range(int(delay * 10)):
                if self.stop_event.is_set():
                    return
                await asyncio.sleep(0.1)

    async def _session(self) -> None:
        async with websockets.connect(self.url, additional_headers={"Authorization": f"Bearer {self.token}"},
                                      max_size=MAX_FRAME, open_timeout=20, ping_interval=None) as ws:
            from pyspark import __version__ as spark_version
            await ws.send(msg("worker_hello", worker_id=self.worker_id, spark_version=spark_version,
                              python_version=platform.python_version(), tasks=sorted(TASKS)))
            ack = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if ack.get("type") != "hello_ack":
                raise websockets.WebSocketException("handshake failed")
            interval = float(ack.get("heartbeat_interval_s", 15))
            await ws.send(msg("worker_ready"))
            log.info("connected as %s", self.worker_id)
            hb = asyncio.create_task(self._heartbeat(ws, interval))
            job: asyncio.Task | None = None
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    t = m.get("type")
                    if t == "job_dispatch":
                        if job and not job.done():
                            continue                                  # one job at a time; backend won't double-dispatch
                        job = asyncio.create_task(self._run_job(ws, m))
                    elif t == "error":
                        log.warning("backend rejected a message: %s", m.get("code"))
                    # server heartbeats need no reply: any traffic refreshes the backend's last_seen
                    if self.stop_event.is_set():
                        await ws.send(msg("worker_shutdown"))
                        return
            finally:
                hb.cancel()
                if job and not job.done():                            # socket dropped: backend will requeue
                    self._cancel_spark()
                    job.cancel()

    async def _heartbeat(self, ws, interval: float) -> None:
        while True:
            await asyncio.sleep(interval)
            await ws.send(msg("heartbeat"))

    # ------------------------------------------------------------ jobs
    def _cancel_spark(self) -> None:
        try:
            self._spark.sparkContext.cancelAllJobs()
        except Exception:
            pass

    async def _run_job(self, ws, m: dict) -> None:
        job_id, task, loop = m["job_id"], m.get("task_type"), asyncio.get_running_loop()
        fn = TASKS.get(task)
        if fn is None:                                                # never executes anything not in the registry
            await ws.send(msg("job_failed", job_id=job_id, error=f"unknown task {str(task)[:60]}"))
            return
        await ws.send(msg("job_started", job_id=job_id))

        def progress(pct: int, text: str = "") -> None:               # called from the Spark thread
            asyncio.run_coroutine_threadsafe(ws.send(msg("job_progress", job_id=job_id, percent=int(pct),
                                                         message=text[:200])), loop)
        t0 = time.time()
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(fn, self._spark, m.get("params") or {}, m.get("dataset") or {}, progress),
                timeout=float(m.get("max_seconds", 900)))
            metrics = {"duration_s": round(time.time() - t0, 2), "rows": (m.get("dataset") or {}).get("rows"),
                       "spark_version": self._spark.version}
            await ws.send(msg("job_completed", job_id=job_id, result=_jsonable(result), metrics=metrics))
            self.jobs_done += 1
        except asyncio.TimeoutError:
            self._cancel_spark()
            await ws.send(msg("job_failed", job_id=job_id, error="timed out on worker"))
        except TaskError as e:
            await ws.send(msg("job_failed", job_id=job_id, error=str(e)[:400]))
        except asyncio.CancelledError:
            raise
        except Exception as e:                                        # don't leak tracebacks / data to the backend
            log.exception("job %s crashed", job_id)
            await ws.send(msg("job_failed", job_id=job_id, error=f"{type(e).__name__} during {task}"))

    def stop(self) -> None:
        self.stop_event.set()


def start_in_background(url: str, token: str, worker_id: str | None = None) -> Worker:
    """For notebooks (which already own an event loop): run the worker in its own thread + loop."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    w = Worker(url, token, worker_id)
    threading.Thread(target=lambda: asyncio.run(w.run_forever()), daemon=True, name="gitarchey-worker").start()
    return w


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    url, token = os.environ.get("GITARCHEY_WS_URL"), os.environ.get("GITARCHEY_WORKER_TOKEN")
    if not url or not token:
        sys.exit("set GITARCHEY_WS_URL and GITARCHEY_WORKER_TOKEN")
    try:
        asyncio.run(Worker(url, token, os.environ.get("GITARCHEY_WORKER_ID")).run_forever())
    except KeyboardInterrupt:
        pass
