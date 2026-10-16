"""Astra DB connection (Cassandra CQL driver + Secure Connect Bundle).

Connection method (per DataStax docs for the Python driver): Cluster(cloud={"secure_connect_bundle": path},
auth_provider=PlainTextAuthProvider("token", "<AstraCS:...application token>")). The keyspace must already
exist in the Astra console. NOTE: not exercised against a live Astra database in this repo's test run.
"""
import asyncio
import base64
import logging
import os
import tempfile

from cassandra.cluster import Cluster, ExecutionProfile, EXEC_PROFILE_DEFAULT
from cassandra.auth import PlainTextAuthProvider
from cassandra.query import dict_factory

from app.core.config import Settings

log = logging.getLogger("gitarchey.astra")


def _bundle_path(settings: Settings) -> str:
    b64 = settings.astra_secure_bundle_b64.get_secret_value()
    if not b64:
        return settings.astra_secure_bundle_path
    fd, path = tempfile.mkstemp(prefix="astra-bundle-", suffix=".zip")  # random name, mode 0600
    with os.fdopen(fd, "wb") as f:
        f.write(base64.b64decode(b64))
    return path


def connect_sync(settings: Settings):
    profile = ExecutionProfile(request_timeout=settings.astra_request_timeout_s, row_factory=dict_factory)
    cluster = Cluster(
        cloud={"secure_connect_bundle": _bundle_path(settings)},
        auth_provider=PlainTextAuthProvider("token", settings.astra_application_token.get_secret_value()),
        execution_profiles={EXEC_PROFILE_DEFAULT: profile},
        connect_timeout=settings.astra_connect_timeout_s,
    )
    session = cluster.connect(settings.astra_keyspace)
    return cluster, session


def aio(response_future) -> asyncio.Future:
    """Bridge a cassandra-driver ResponseFuture to an awaitable without blocking the event loop."""
    loop = asyncio.get_running_loop()
    fut = loop.create_future()

    def ok(rows):
        # drain all pages in the driver thread-safe way: caller uses has_more_pages if needed
        loop.call_soon_threadsafe(lambda: fut.done() or fut.set_result(rows))

    def err(exc):
        loop.call_soon_threadsafe(lambda: fut.done() or fut.set_exception(exc))

    response_future.add_callbacks(ok, err)
    return fut
