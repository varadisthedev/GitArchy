"""Opt-in: runs AstraStore + migrations against a REAL Cassandra-compatible endpoint.

  RUN_INTEGRATION=1 ASTRA_SECURE_BUNDLE_PATH=... ASTRA_APPLICATION_TOKEN=AstraCS:... ASTRA_KEYSPACE=... pytest -m integration
or, against a local Cassandra (docker run -p 9042:9042 cassandra:5):
  RUN_INTEGRATION=1 CASSANDRA_HOST=127.0.0.1 [CASSANDRA_PORT=9042] pytest -m integration

Local mode creates/uses keyspace `gitarchey_it`. Astra mode uses your existing keyspace (tables are IF NOT EXISTS
and rows use random ids; nothing is dropped).
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone

import pytest

from app.core.exceptions import Conflict
from app.integrations.astra.repositories import AstraStore
from app.integrations.astra.schema import migrate

pytestmark = [pytest.mark.integration,
              pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1")]
NOW = lambda: datetime.now(timezone.utc)


@pytest.fixture(scope="module")
def session():
    if not (os.getenv("ASTRA_SECURE_BUNDLE_PATH") or os.getenv("CASSANDRA_HOST")):
        pytest.skip("set ASTRA_* or CASSANDRA_HOST")
    from cassandra.cluster import Cluster, ExecutionProfile, EXEC_PROFILE_DEFAULT
    from cassandra.query import dict_factory
    prof = {EXEC_PROFILE_DEFAULT: ExecutionProfile(row_factory=dict_factory, request_timeout=30)}
    if os.getenv("ASTRA_SECURE_BUNDLE_PATH"):
        from app.core.config import Settings
        from app.integrations.astra.client import connect_sync
        _, s = connect_sync(Settings(_env_file=None, database_backend="astra"))
    else:
        cluster = Cluster([os.environ["CASSANDRA_HOST"]], port=int(os.getenv("CASSANDRA_PORT", "9042")),
                          execution_profiles=prof)
        s = cluster.connect()
        s.execute("CREATE KEYSPACE IF NOT EXISTS gitarchey_it WITH replication = "
                  "{'class': 'SimpleStrategy', 'replication_factor': 1}")
        s.set_keyspace("gitarchey_it")
    migrate(s)
    assert migrate(s) == []        # idempotent
    yield s
    s.cluster.shutdown()


@pytest.fixture
def store(session):
    return AstraStore(session)


def user(email=None):
    return {"id": str(uuid.uuid4()), "email": email or f"{uuid.uuid4().hex}@it.test", "display_name": "IT",
            "password_hash": "h", "avatar_url": None, "avatar_public_id": None, "created_at": NOW()}


async def test_users_and_email_uniqueness_under_race(store):
    a, b = user("race-" + uuid.uuid4().hex + "@it.test"), None
    b = {**user(a["email"])}
    res = await asyncio.gather(store.create_user(a), store.create_user(b), return_exceptions=True)
    assert sum(isinstance(r, Conflict) for r in res) == 1 and sum(r is None for r in res) == 1
    winner = await store.get_user_by_email(a["email"])
    assert winner["id"] in (a["id"], b["id"])
    upd = await store.update_user(winner["id"], display_name="New", avatar_url="https://x")
    assert upd["display_name"] == "New" and isinstance(upd["created_at"], datetime) and upd["created_at"].tzinfo


async def test_orphan_email_claim_heals(store, session):
    u = user()
    session.execute("INSERT INTO users_by_email (email, user_id) VALUES (%s, %s)", (u["email"], uuid.uuid4()))
    await store.create_user(u)                                        # crashed registration left a claim
    assert (await store.get_user_by_email(u["email"]))["id"] == u["id"]


async def test_repos_members_events(store):
    owner, other = user(), user()
    await store.create_user(owner); await store.create_user(other)
    rid = str(uuid.uuid4())
    repo = {"id": rid, "owner_id": owner["id"], "name": "Demo", "description": "d", "visibility": "private",
            "default_branch": "main", "created_at": NOW(), "updated_at": NOW()}
    await store.create_repo(repo)
    with pytest.raises(Conflict):
        await store.create_repo({**repo, "id": str(uuid.uuid4()), "name": "demo"})   # case-insensitive per owner
    assert await store.get_role(rid, owner["id"]) == "owner"
    await store.set_member(rid, other["id"], "reader")
    assert [r["id"] for r in await store.list_repos_for_user(other["id"])] == [rid]
    assert {m["user_id"] for m in await store.list_members(rid)} == {owner["id"], other["id"]}
    for i in range(5):
        await store.add_event(rid, owner["id"], "commit.created", {"i": i})
    evs = await store.list_repo_events(rid, 3)
    assert [e["data"]["i"] for e in evs] == [4, 3, 2]                              # newest first
    assert len(await store.list_user_activity(owner["id"], 10)) == 5
    await store.update_repo(rid, description="new")
    assert (await store.get_repo(rid))["description"] == "new"
    await store.remove_member(rid, other["id"])
    assert await store.list_repos_for_user(other["id"]) == []
    await store.delete_repo(rid)
    assert await store.get_repo(rid) is None and await store.list_repo_events(rid, 5) == []
    await store.create_repo({**repo, "id": str(uuid.uuid4())})                       # name free again


async def test_token_revocation_ttl(store):
    jti = uuid.uuid4().hex
    assert not await store.is_token_revoked(jti)
    await store.revoke_token(jti, 2)
    assert await store.is_token_revoked(jti)
    time.sleep(3)
    assert not await store.is_token_revoked(jti)


async def test_analytics_jobs(store):
    u = user()
    jid = str(uuid.uuid4())
    job = {"id": jid, "user_id": u["id"], "task_type": "file_stats_sql", "params": {"top_n": 3}, "repo_ids": [],
           "status": "queued", "attempts": 0, "created_at": NOW()}
    assert await store.create_job(job) is True
    assert await store.create_job(job) is False                                      # idempotent by id
    assert jid in [j["id"] for j in await store.list_open_jobs()]
    j = await store.update_job(jid, status="running", attempts=1, started_at=NOW())
    assert j["status"] == "running" and j["params"] == {"top_n": 3}
    j = await store.update_job(jid, status="succeeded", result={"ok": [1, 2]}, metrics={"s": 1.5}, finished_at=NOW())
    assert j["result"] == {"ok": [1, 2]} and jid not in [x["id"] for x in await store.list_open_jobs()]
    assert [x["id"] for x in await store.list_jobs_for_user(u["id"], 5)] == [jid]
