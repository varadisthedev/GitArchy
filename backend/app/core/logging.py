"""Structured JSON logging with secret redaction."""
import contextvars
import json
import logging
import re
import sys
from datetime import datetime, timezone

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)

_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}
_SENSITIVE_KEY = re.compile(r"pass|secret|token|authorization|api_key|cookie|content", re.I)
_BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9._~+/=-]+", re.I)
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*")
_ASTRA = re.compile(r"AstraCS:[A-Za-z0-9:._-]+")


def redact_text(s: str) -> str:
    s = _BEARER.sub(r"\1[REDACTED]", s)
    s = _JWT.sub("[REDACTED_JWT]", s)
    return _ASTRA.sub("[REDACTED_ASTRA]", s)


def redact(value, key: str = ""):
    if key and _SENSITIVE_KEY.search(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {k: redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact_text(record.getMessage()),
            "request_id": request_id_var.get(),
        }
        for k, v in record.__dict__.items():
            if k not in _RESERVED and not k.startswith("_"):
                out[k] = redact(v, k)
        if record.exc_info and record.exc_info[0]:
            # type + message only; full tracebacks may embed secrets/paths
            out["exc"] = f"{record.exc_info[0].__name__}: {redact_text(str(record.exc_info[1]))[:300]}"
        return json.dumps(out, default=str)


def setup_logging(level: str = "INFO") -> None:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [h]
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").disabled = True  # replaced by our access log
