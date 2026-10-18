"""Gitarchey API entrypoint."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.dependencies import Context
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import install_handlers
from app.core.logging import setup_logging
from app.core.middleware import RequestContextMiddleware
from app.core.rate_limit import Limiter
from app.integrations.git.manager import GitManager
from app.integrations.git.storage import LocalRepositoryStorage

log = logging.getLogger("gitarchey")


async def build_store(settings: Settings):
    """Pick the DB backend. No fallback: DATABASE_BACKEND=astra + unreachable Astra => startup fails."""
    if settings.database_backend == "memory":
        from app.integrations.astra.memory import MemoryStore
        log.warning("using_memory_database", extra={"note": "data is lost on restart; not for production"})
        return MemoryStore()
    from app.integrations.astra.client import connect_sync
    from app.integrations.astra.repositories import AstraStore
    from app.integrations.astra.schema import migrate
    _, session = await asyncio.to_thread(connect_sync, settings)
    if settings.astra_auto_migrate:
        applied = await asyncio.to_thread(migrate, session)
        log.info("schema_migrated", extra={"versions": applied})
    store = AstraStore(session)
    await store.ping()
    return store


def create_app(settings: Settings | None = None, store=None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        st = store or await build_store(settings)
        storage = LocalRepositoryStorage(settings.git_repos_dir)
        git = GitManager(settings, storage)
        log.info("git_ready", extra={"version": await asyncio.to_thread(git.version)})  # fails fast if git missing
        ctx = Context(settings=settings, store=st, git=git, storage=storage, limiter=Limiter(settings))
        if settings.r2_configured:
            from app.integrations.git.mirror import RepoMirror
            from app.integrations.r2.client import R2Client
            ctx.r2 = R2Client(settings)
            # object storage holds every repository; this instance's disk is a cache of it
            git.mirror = RepoMirror(ctx.r2, st, storage)
        else:
            log.warning("r2_not_configured", extra={"note": "repositories live on local disk only"})
        if settings.cloudinary_configured:
            from app.integrations.cloudinary.client import CloudinaryClient
            ctx.cloudinary = CloudinaryClient(settings)
        else:
            log.warning("cloudinary_not_configured")
        if settings.workers_enabled:
            from app.integrations.spark.job_manager import JobManager
            from app.modules.analytics.datasets import build_dataset
            ctx.jobs = JobManager(st, settings, lambda job: build_dataset(ctx, job))
            await ctx.jobs.start()
        else:
            log.warning("analytics_disabled", extra={"note": "WORKER_TOKEN not set"})
        missing_github = [n for n, v in (
            ("GITHUB_OAUTH_CLIENT_ID", settings.github_oauth_client_id),
            ("GITHUB_OAUTH_CLIENT_SECRET", settings.github_oauth_client_secret.get_secret_value()),
            ("GITHUB_OAUTH_REDIRECT_URI", settings.github_oauth_redirect_uri)) if not v]
        if missing_github:
            log.warning("github_not_configured", extra={"missing": missing_github})
        app.state.ctx = ctx
        # one line naming every optional integration and the two values that silently break OAuth
        # (redirect uri + CORS origins). Never log a secret: presence only, checked above.
        log.info("startup_complete", extra={
            "env": settings.app_env, "db": st.kind,
            # which object-storage provider won: filebase takes precedence when fully configured
            "storage": {"endpoint": ctx.r2.endpoint, "bucket": ctx.r2.bucket} if ctx.r2 else None,
            "integrations": {"r2": settings.r2_configured, "cloudinary": settings.cloudinary_configured,
                             "analytics": settings.workers_enabled, "github": settings.github_configured},
            "github_oauth_client_id": settings.github_oauth_client_id or None,
            "github_redirect_uri": settings.github_oauth_redirect_uri or None,
            "allowed_origins": settings.allowed_origins})
        try:
            yield
        finally:
            if ctx.jobs:
                await ctx.jobs.stop()
            await st.close()
            log.info("shutdown_complete")

    app = FastAPI(title="Gitarchey API", version="0.1.0", lifespan=lifespan,
                  docs_url=None if settings.is_prod else "/docs",
                  redoc_url=None, openapi_url=None if settings.is_prod else "/openapi.json")
    install_handlers(app)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=False,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"], expose_headers=["X-Request-ID"])
    app.add_middleware(RequestContextMiddleware, max_body=settings.max_request_body_bytes,
                       max_upload=settings.max_upload_bytes, hsts=settings.is_prod)
    app.include_router(api_router)

    @app.get("/health", tags=["ops"])
    async def health():
        return {"status": "ok"}

    @app.get("/ready", tags=["ops"])
    async def ready(request: Request):
        """Required: database + git. Optional integrations report configured/not; none of them leak secrets."""
        ctx: Context = request.app.state.ctx
        checks = {}
        try:
            await asyncio.wait_for(ctx.store.ping(), 5)
            checks["database"] = ctx.store.kind
        except Exception:
            checks["database"] = "unavailable"
        try:
            await asyncio.to_thread(ctx.git.version)
            checks["git"] = "ok"
        except Exception:
            checks["git"] = "unavailable"
        ok = checks["database"] != "unavailable" and checks["git"] == "ok"
        # r2 is the one integration a user can watch fail (bundle export), so it is really probed
        optional = {"r2": await ctx.r2.status() if ctx.r2 else "off", "cloudinary": bool(ctx.cloudinary),
                    "analytics_enabled": bool(ctx.jobs), "spark_worker_connected": bool(ctx.jobs and ctx.jobs.worker_available)}
        return JSONResponse({"status": "ready" if ok else "not_ready", "checks": checks, "optional": optional},
                            200 if ok else 503)

    return app


def __getattr__(name):  # lazy `app` so importing this module in tests doesn't build settings
    if name == "app":
        return create_app()
    raise AttributeError(name)
