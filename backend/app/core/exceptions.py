"""Public error envelope: {"error": {"code", "message", "request_id"}}. Internals are logged, never returned."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("gitarchey.errors")


class AppError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str = "", *, code: str | None = None, status: int | None = None):
        super().__init__(message)
        if code:
            self.code = code
        if status:
            self.status = status
        self.message = message or self.code


class NotFound(AppError):
    status, code = 404, "not_found"


class Forbidden(AppError):
    status, code = 403, "forbidden"


class Unauthorized(AppError):
    status, code = 401, "unauthorized"


class Conflict(AppError):
    status, code = 409, "conflict"


class PayloadTooLarge(AppError):
    status, code = 413, "payload_too_large"


class RateLimited(AppError):
    status, code = 429, "rate_limited"


class Unavailable(AppError):
    status, code = 503, "service_unavailable"


def _body(request: Request, code: str, message: str, extra: dict | None = None) -> dict:
    err = {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None)}
    if extra:
        err.update(extra)
    return {"error": err}


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app(request: Request, exc: AppError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        if isinstance(exc, RateLimited):
            headers = {"Retry-After": "60"}
        return JSONResponse(_body(request, exc.code, exc.message), exc.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _val(request: Request, exc: RequestValidationError):
        # never echo submitted values (could contain passwords)
        details = [{"loc": [str(p) for p in e["loc"]], "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse(_body(request, "validation_error", "Invalid request", {"details": details}), 422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        return JSONResponse(_body(request, "http_error", str(exc.detail)), exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.error("unhandled_exception", exc_info=exc, extra={"path": request.url.path})
        return JSONResponse(_body(request, "internal_error", "Internal server error"), 500)
