"""Rate limiting on the `limits` library (the engine under slowapi), usable from HTTP and WebSocket handlers.

Storage defaults to memory:// - counters are per process, reset on restart and NOT shared between
instances. Point RATE_LIMIT_STORAGE_URI at redis://... later; no code change needed.
"""
from fastapi import Request, WebSocket
from limits import parse
from limits.storage import storage_from_string
from limits.aio.strategies import MovingWindowRateLimiter

from app.core.config import Settings
from app.core.exceptions import RateLimited


class Limiter:
    def __init__(self, settings: Settings):
        self.enabled = settings.rate_limit_enabled
        self.settings = settings
        self._rl = MovingWindowRateLimiter(storage_from_string(
            "async+" + settings.rate_limit_storage_uri.removeprefix("async+")))
        self._parsed: dict[str, object] = {}

    def client_ip(self, conn: Request | WebSocket) -> str:
        if self.settings.trust_proxy_headers:
            fwd = conn.headers.get("x-forwarded-for")
            if fwd:
                return fwd.split(",")[0].strip()
        return conn.client.host if conn.client else "unknown"

    async def hit(self, policy: str, key: str) -> bool:
        if not self.enabled:
            return True
        spec = getattr(self.settings, f"rl_{policy}")
        item = self._parsed.setdefault(spec, parse(spec))
        return await self._rl.hit(item, policy, key)

    async def check(self, policy: str, conn: Request | WebSocket, user_id: str | None = None) -> None:
        key = f"u:{user_id}" if user_id else f"ip:{self.client_ip(conn)}"
        if not await self.hit(policy, key):
            raise RateLimited("Too many requests, slow down")

    async def reset(self) -> None:
        await self._rl.storage.reset()
