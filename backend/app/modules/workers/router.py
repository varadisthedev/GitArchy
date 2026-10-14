"""WebSocket endpoint the Colab/Spark worker connects OUT to. Auth: dedicated worker token (not a user JWT)."""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.api.dependencies import Context
from app.core.exceptions import AppError
from app.core.security import secrets_equal
from app.integrations.spark import protocol as P
from app.integrations.spark.job_manager import WorkerConn

log = logging.getLogger("gitarchey.workers")
router = APIRouter(prefix="/workers", tags=["workers"])

MAX_FRAME = 2_000_000
MAX_STRIKES = 3


def _token(ws: WebSocket) -> str:
    h = ws.headers.get("authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else ""


@router.websocket("/spark/connect")
async def spark_connect(ws: WebSocket):
    ctx: Context = ws.app.state.ctx
    cfg = ctx.settings
    try:
        await ctx.limiter.check("ws_connect", ws)
    except AppError:
        await ws.close(1008)
        return
    expected = cfg.worker_token.get_secret_value()
    if not ctx.jobs or not expected or not secrets_equal(_token(ws), expected):
        log.warning("worker_auth_rejected", extra={"client": ctx.limiter.client_ip(ws)})
        await ws.close(1008)  # before accept => HTTP 403 to the client
        return
    await ws.accept()
    conn: WorkerConn | None = None
    strikes = 0
    try:
        hello = await _recv(ws, timeout=10)
        if not isinstance(hello, P.WorkerHello):
            await ws.close(1002)
            return
        if len(ctx.jobs.workers) >= ctx.jobs.MAX_WORKERS and hello.worker_id not in ctx.jobs.workers:
            await ws.close(1013)
            return
        conn = WorkerConn(id=hello.worker_id, ws=ws, tasks={t for t in hello.tasks if t in P.TASKS})
        await ctx.jobs.register(conn)
        await ws.send_json(P.hello_ack(cfg.worker_heartbeat_interval_s))

        async def pinger():
            while True:
                await asyncio.sleep(cfg.worker_heartbeat_interval_s)
                await ws.send_json(P.server_heartbeat())

        ping = asyncio.create_task(pinger())
        try:
            while True:
                try:
                    msg = await _recv(ws, timeout=cfg.worker_heartbeat_timeout_s)
                except _Bad:
                    strikes += 1
                    await ws.send_json(P.protocol_error("invalid_message"))
                    if strikes >= MAX_STRIKES:
                        await ws.close(1003)
                        return
                    continue
                await ctx.jobs.on_message(conn, msg)
        finally:
            ping.cancel()
    except (WebSocketDisconnect, asyncio.TimeoutError, _Bad, RuntimeError):
        pass
    finally:
        if conn:
            await ctx.jobs.unregister(conn, "disconnected")


class _Bad(Exception):
    pass


async def _recv(ws: WebSocket, timeout: float):
    raw = await asyncio.wait_for(ws.receive_text(), timeout)
    if len(raw) > MAX_FRAME:
        raise _Bad
    try:
        return P.worker_message_adapter.validate_python(json.loads(raw))
    except (ValidationError, ValueError):
        raise _Bad from None
