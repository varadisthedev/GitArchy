"""Request id, access log, body-size limit, security headers (pure ASGI, WebSocket-safe)."""
import json
import logging
import time
import uuid

from app.core.logging import request_id_var

log = logging.getLogger("gitarchey.access")

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
]


class _TooLarge(Exception):
    pass


class RequestContextMiddleware:
    def __init__(self, app, max_body: int, max_upload: int, hsts: bool = False):
        self.app, self.max_body, self.max_upload, self.hsts = app, max_body, max_upload, hsts

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        rid = uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = rid
        request_id_var.set(rid)
        start = time.perf_counter()
        status = {"v": 500}
        started = {"v": False}

        headers = dict(scope["headers"])
        limit = self.max_upload if headers.get(b"content-type", b"").startswith(b"multipart/") else self.max_body
        try:
            cl = int(headers.get(b"content-length", b"0"))
        except ValueError:
            cl = 0
        received = {"n": 0}

        async def limited_receive():
            msg = await receive()
            if msg["type"] == "http.request":
                received["n"] += len(msg.get("body", b""))
                if received["n"] > limit:
                    raise _TooLarge()
            return msg

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                started["v"] = True
                status["v"] = message["status"]
                h = list(message.get("headers", [])) + SECURITY_HEADERS
                h.append((b"x-request-id", rid.encode()))
                if self.hsts:
                    h.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = h
            await send(message)

        try:
            if cl > limit:
                raise _TooLarge()
            await self.app(scope, limited_receive, send_wrapper)
        except _TooLarge:
            if not started["v"]:
                status["v"] = 413
                body = json.dumps({"error": {"code": "payload_too_large",
                                             "message": "Request body too large",
                                             "request_id": rid}}).encode()
                await send_wrapper({"type": "http.response.start", "status": 413,
                                    "headers": [(b"content-type", b"application/json"),
                                                (b"content-length", str(len(body)).encode())]})
                await send_wrapper({"type": "http.response.body", "body": body})
        except Exception as exc:
            # handled here (not by Starlette's outermost handler) so the 500 still carries X-Request-ID + headers
            logging.getLogger("gitarchey.errors").error("unhandled_exception", exc_info=exc,
                                                       extra={"path": scope["path"]})
            if not started["v"]:
                status["v"] = 500
                body = json.dumps({"error": {"code": "internal_error", "message": "Internal server error",
                                             "request_id": rid}}).encode()
                await send_wrapper({"type": "http.response.start", "status": 500,
                                    "headers": [(b"content-type", b"application/json"),
                                                (b"content-length", str(len(body)).encode())]})
                await send_wrapper({"type": "http.response.body", "body": body})
        finally:
            log.info("request", extra={
                "request_id": rid, "method": scope["method"], "path": scope["path"], "status": status["v"],
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                "user_id": scope.get("state", {}).get("user_id")})
