"""AstraStore against a scripted fake driver session: statement hygiene + multi-table failure handling."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.core.exceptions import Conflict
from app.integrations.astra import schema
from app.integrations.astra.repositories import AstraStore

UID, RID, OID = (str(uuid.uuid4()) for _ in range(3))
NOW = datetime.now(timezone.utc)


class Fut:
    def __init__(self, rows=None, exc=None):
        self.rows, self.exc = rows or [], exc

    def add_callbacks(self, ok, err):
        err(self.exc) if self.exc else ok(self.rows)


class Session:
    def __init__(self, handler=None):
        self.calls, self.handler = [], handler

    def prepare(self, cql):
        return SimpleNamespace(query_string=cql)

    def execute_async(self, ps, params=()):
        cql = ps if isinstance(ps, str) else ps.query_string
        self.calls.append((cql, params))
        if self.handler:
            r = self.handler(cql, params)
            if r is not None:
                return r
        return Fut([{"[applied]": True}] if " IF " in cql else [])

    def stmts(self, prefix):
        return [c for c, _ in self.calls if c.startswith(prefix)]


USER = {"id": UID, "email": "a@b.co", "display_name": "A", "password_hash": "h", "created_at": NOW}


async def test_every_statement_is_parameterised():
    s = Session()
    st = AstraStore(s)
    repo = {"id": RID, "owner_id": OID, "name": "R", "description": "d", "visibility": "private",
            "default_branch": "main", "created_at": NOW, "updated_at": NOW}
    job = {"id": RID, "user_id": UID, "task_type": "t", "params": {}, "repo_ids": [], "status": "queued",
           "attempts": 0, "created_at": NOW}
    evil = "x'; DROP TABLE users_by_id; --"
    await st.create_user({**USER, "display_name": evil})
    await st.get_user(UID); await st.get_user_by_email(evil)
    await st.update_user(UID, display_name=evil, avatar_url="u", bogus_column="ignored")
    await st.revoke_token("jti", 100); await st.is_token_revoked(evil)
    await st.create_repo({**repo, "name": evil, "description": evil}); await st.get_repo(RID)
    await st.list_repos_for_user(UID); await st.update_repo(RID, description=evil, bogus="x")
    await st.set_member(RID, UID, "writer"); await st.get_role(RID, UID); await st.list_members(RID)
    await st.remove_member(RID, UID); await st.add_event(RID, UID, "t", {"q": evil})
    await st.list_repo_events(RID, 5); await st.list_user_activity(UID, 5)
    await st.add_notification(UID, "t", {}); await st.list_notifications(UID, 5)
    await st.index_commit(RID, {"sha": "a", "branch": "m", "author_id": UID, "author_name": evil, "message": evil,
                                "committed_at": NOW})
    await st.index_branch(RID, evil, "sha", UID); await st.list_indexed_commits(RID, 3)
    await st.create_job(job); await st.get_job(RID); await st.update_job(RID, status="failed", error=evil, bogus=1)
    await st.list_jobs_for_user(UID, 5); await st.list_open_jobs()
    await st.add_repo_result(RID, RID, "t", {}); await st.list_repo_results(RID, 3); await st.delete_repo(RID)
    assert len(s.calls) > 40
    for cql, params in s.calls:
        assert cql.count("?") == len(params), cql                     # values only ever travel as bound params
        assert evil not in cql and "bogus" not in cql, cql
        assert "DROP" not in cql.upper() and "TRUNCATE" not in cql.upper()


async def test_create_user_conflict_when_email_claimed_by_real_user():
    def h(cql, p):
        if cql.startswith("INSERT INTO users_by_email"):
            return Fut([{"[applied]": False, "user_id": uuid.UUID(OID)}])
        if cql.startswith("SELECT * FROM users_by_id"):
            return Fut([{"user_id": uuid.UUID(OID), "email": "a@b.co", "display_name": "X", "password_hash": "h",
                         "avatar_url": None, "avatar_public_id": None, "created_at": NOW}])
    s = Session(h)
    with pytest.raises(Conflict) as e:
        await AstraStore(s).create_user(USER)
    assert e.value.code == "email_taken" and not s.stmts("INSERT INTO users_by_id")


async def test_create_user_heals_orphan_claim_from_crashed_registration():
    def h(cql, p):
        if cql.startswith("INSERT INTO users_by_email"):
            return Fut([{"[applied]": False, "user_id": uuid.UUID(OID)}])   # claim exists...
        # ...but SELECT FROM users_by_id returns [] -> orphan; CAS UPDATE applies by default
    s = Session(h)
    await AstraStore(s).create_user(USER)
    assert s.stmts("UPDATE users_by_email") and s.stmts("INSERT INTO users_by_id")


async def test_create_user_releases_claim_if_canonical_write_fails():
    def h(cql, p):
        if cql.startswith("INSERT INTO users_by_id"):
            return Fut(exc=RuntimeError("write timeout"))
    s = Session(h)
    with pytest.raises(RuntimeError):
        await AstraStore(s).create_user(USER)
    assert s.stmts("DELETE FROM users_by_email")                          # compensating action


async def test_repo_name_claim_conflict():
    def h(cql, p):
        if cql.startswith("INSERT INTO repositories_by_owner"):
            return Fut([{"[applied]": False, "repo_id": uuid.UUID(RID)}])
        if cql.startswith("SELECT * FROM repositories_by_id"):
            return Fut([{"repo_id": uuid.UUID(RID), "owner_id": uuid.UUID(OID), "name": "r", "description": "",
                         "visibility": "private", "default_branch": "main", "created_at": NOW, "updated_at": NOW}])
    s = Session(h)
    repo = {"id": str(uuid.uuid4()), "owner_id": OID, "name": "R", "description": "", "visibility": "private",
            "default_branch": "main", "created_at": NOW, "updated_at": NOW}
    with pytest.raises(Conflict):
        await AstraStore(s).create_repo(repo)
    assert not s.stmts("INSERT INTO repositories_by_id")


async def test_event_buckets_scan_back_until_limit():
    s = Session()
    await AstraStore(s).list_repo_events(RID, 10)
    assert len(s.stmts("SELECT * FROM events_by_repo")) == AstraStore.EVENT_MONTHS   # empty history scans N buckets


def test_schema_is_additive_and_versioned():
    versions = [v for v, _, _ in schema.MIGRATIONS]
    assert versions == sorted(set(versions)) and versions[0] == 1
    all_cql = " ".join(s for _, _, stmts in schema.MIGRATIONS for s in stmts).upper()
    assert "DROP " not in all_cql and "TRUNCATE" not in all_cql
    for _, _, stmts in schema.MIGRATIONS:
        # CREATE must be re-runnable. ALTER ... ADD can't be: "IF NOT EXISTS" there is only valid on
        # newer Cassandra than Astra guarantees, and the version table already stops a second run.
        assert all("IF NOT EXISTS" in s.upper() or s.upper().startswith("ALTER TABLE") for s in stmts)
    for t in ("users_by_email", "users_by_id", "repositories_by_id", "repositories_by_owner", "members_by_repo",
              "branches_by_repo", "commits_by_repo", "activity_by_user", "events_by_repo", "notifications_by_user",
              "analytics_jobs_by_id", "analytics_results_by_repo", "revoked_tokens"):
        assert f"EXISTS {t}" in " ".join(s for _, _, st in schema.MIGRATIONS for s in st).replace("\n", " ").replace("  ", " ") or t in all_cql.lower()


def test_migrate_applies_pending_only():
    def run(applied: set[int]):
        seen = []

        class S:
            def execute(self, cql, params=None):
                seen.append(cql)
                return [{"version": v} for v in applied] if cql.startswith("SELECT version") else []
        return schema.migrate(S()), seen

    versions = [v for v, _, _ in schema.MIGRATIONS]
    # everything already applied: no DDL beyond the version table itself
    done, seen = run(set(versions))
    assert done == []
    assert not any(c.startswith("CREATE TABLE IF NOT EXISTS users_by_id") for c in seen)
    # only the first applied: every later migration runs, the first does not re-run
    done, seen = run({versions[0]})
    assert done == versions[1:]
    assert not any(c.startswith("CREATE TABLE IF NOT EXISTS users_by_id") for c in seen)
    # fresh keyspace: all of them, in order
    done, _ = run(set())
    assert done == versions == sorted(versions)
