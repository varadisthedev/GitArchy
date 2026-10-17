"""AstraStore: every access pattern as a prepared CQL statement (no string-built values, ever).

Consistency model (see docs/architecture.md): Cassandra has no multi-table transactions, so
multi-table writes are ordered "claim first, canonical second, denormalised views last", each step
idempotent. Uniqueness (email, owner+repo name) uses lightweight transactions (IF NOT EXISTS).
A crash between steps can leave an orphan claim; claims whose canonical row is missing are
detected and re-claimed with a CAS update, so orphans never block a user permanently.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from cassandra.util import uuid_from_time

from app.core.exceptions import Conflict
from app.integrations.astra.client import aio
from app.integrations.astra.memory import month_bucket, utcnow

log = logging.getLogger("gitarchey.astra")

USER_COLS = {"display_name", "avatar_url", "avatar_public_id", "password_hash"}
REPO_COLS = {"description", "visibility", "default_branch", "updated_at"}
JOB_COLS = {"status", "attempts", "error", "result", "metrics", "updated_at", "started_at", "finished_at"}
JSON_JOB = {"result", "metrics"}


def _u(v) -> uuid.UUID:
    return v if isinstance(v, uuid.UUID) else uuid.UUID(str(v))


def _ts(v):
    return v.replace(tzinfo=timezone.utc) if isinstance(v, datetime) and v.tzinfo is None else v


def _months_back(n: int):
    now = utcnow()
    y, m = now.year, now.month
    for _ in range(n):
        yield f"{y:04d}-{m:02d}"
        m -= 1
        if m == 0:
            y, m = y - 1, 12


class AstraStore:
    kind = "astra"
    EVENT_MONTHS = 12  # how many month-buckets a list call will scan back

    def __init__(self, session):
        self.s = session
        self._prep: dict[str, object] = {}

    # ---- plumbing ----
    async def _x(self, cql: str, params: tuple = ()):
        ps = self._prep.get(cql)
        if ps is None:
            ps = await asyncio.to_thread(self.s.prepare, cql)  # blocking only on first use
            self._prep[cql] = ps
        return list(await aio(self.s.execute_async(ps, params)) or [])

    async def _applied(self, cql: str, params: tuple) -> tuple[bool, dict]:
        rows = await self._x(cql, params)
        row = rows[0] if rows else {}
        return bool(row.get("[applied]")), row

    async def ping(self) -> bool:
        await aio(self.s.execute_async("SELECT release_version FROM system.local"))
        return True

    async def close(self) -> None:
        await asyncio.to_thread(self.s.cluster.shutdown)

    # ---- users ----
    @staticmethod
    def _user(r: dict | None) -> dict | None:
        if not r:
            return None
        return {"id": str(r["user_id"]), "email": r["email"], "display_name": r["display_name"],
                "password_hash": r["password_hash"], "avatar_url": r["avatar_url"],
                "avatar_public_id": r["avatar_public_id"], "created_at": _ts(r["created_at"])}

    async def create_user(self, u: dict) -> None:
        uid = _u(u["id"])
        ok, row = await self._applied(
            "INSERT INTO users_by_email (email, user_id) VALUES (?, ?) IF NOT EXISTS", (u["email"], uid))
        if not ok:
            # orphan claim (crash before users_by_id was written)? re-claim with CAS
            existing = row.get("user_id")
            if existing and await self.get_user(str(existing)) is None:
                ok, _ = await self._applied(
                    "UPDATE users_by_email SET user_id = ? WHERE email = ? IF user_id = ?",
                    (uid, u["email"], existing))
            if not ok:
                raise Conflict("Email already registered", code="email_taken")
        try:
            await self._x(
                "INSERT INTO users_by_id (user_id, email, display_name, password_hash, avatar_url, "
                "avatar_public_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uid, u["email"], u["display_name"], u["password_hash"], u.get("avatar_url"),
                 u.get("avatar_public_id"), u["created_at"]))
        except Exception:
            try:  # compensate; if this fails too the orphan self-heals on next register
                await self._x("DELETE FROM users_by_email WHERE email = ? IF user_id = ?", (u["email"], uid))
            except Exception:
                log.warning("user_claim_cleanup_failed")
            raise

    async def get_user(self, user_id: str) -> dict | None:
        rows = await self._x("SELECT * FROM users_by_id WHERE user_id = ?", (_u(user_id),))
        return self._user(rows[0] if rows else None)

    async def get_user_by_email(self, email: str) -> dict | None:
        rows = await self._x("SELECT user_id FROM users_by_email WHERE email = ?", (email,))
        return await self.get_user(str(rows[0]["user_id"])) if rows else None  # orphan claim -> None

    async def update_user(self, user_id: str, **fields) -> dict | None:
        cols = sorted(c for c in fields if c in USER_COLS)
        if cols:
            sets = ", ".join(f"{c} = ?" for c in cols)  # column names come from a whitelist
            await self._x(f"UPDATE users_by_id SET {sets} WHERE user_id = ?",
                          tuple(fields[c] for c in cols) + (_u(user_id),))
        return await self.get_user(user_id)

    # ---- github identity ----
    @staticmethod
    def _ident(r: dict | None) -> dict | None:
        if not r:
            return None
        return {"user_id": str(r["user_id"]), "github_id": int(r["github_id"]), "login": r["login"],
                "access_token": r["access_token"], "scope": r["scope"] or "",
                "avatar_url": r["avatar_url"], "connected_at": _ts(r["connected_at"])}

    async def set_github_identity(self, user_id: str, ident: dict) -> None:
        """Claim the GitHub account for this user, then store the token. Re-connecting the same
        account by the same user is idempotent; another user's account raises Conflict."""
        uid, gid = _u(user_id), int(ident["github_id"])
        ok, row = await self._applied(
            "INSERT INTO users_by_github_id (github_id, user_id) VALUES (?, ?) IF NOT EXISTS", (gid, uid))
        if not ok and str(row.get("user_id")) != str(uid):
            owner = str(row.get("user_id"))
            if await self.get_user(owner) is None:  # orphan claim: the user row is gone, re-claim
                ok, _ = await self._applied(
                    "UPDATE users_by_github_id SET user_id = ? WHERE github_id = ? IF user_id = ?",
                    (uid, gid, row.get("user_id")))
            if not ok:
                raise Conflict("That GitHub account is already linked to another Gitarchey user",
                               code="github_already_linked")
        await self._x(
            "INSERT INTO github_identity_by_user (user_id, github_id, login, access_token, scope, "
            "avatar_url, connected_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, gid, ident["login"], ident["access_token"], ident.get("scope", ""),
             ident.get("avatar_url"), ident.get("connected_at") or utcnow()))

    async def get_github_identity(self, user_id: str) -> dict | None:
        rows = await self._x("SELECT * FROM github_identity_by_user WHERE user_id = ?", (_u(user_id),))
        return self._ident(rows[0] if rows else None)

    async def get_user_by_github_id(self, github_id: int) -> dict | None:
        rows = await self._x("SELECT user_id FROM users_by_github_id WHERE github_id = ?", (int(github_id),))
        return await self.get_user(str(rows[0]["user_id"])) if rows else None  # orphan claim -> None

    async def clear_github_identity(self, user_id: str) -> None:
        ident = await self.get_github_identity(user_id)
        await self._x("DELETE FROM github_identity_by_user WHERE user_id = ?", (_u(user_id),))
        if ident:  # release the claim only if it is still ours
            await self._x("DELETE FROM users_by_github_id WHERE github_id = ? IF user_id = ?",
                          (int(ident["github_id"]), _u(user_id)))

    # ---- token revocation ----
    async def revoke_token(self, jti: str, ttl_s: int) -> None:
        await self._x("INSERT INTO revoked_tokens (jti, revoked_at) VALUES (?, ?) USING TTL ?",
                      (jti, utcnow(), max(int(ttl_s), 1)))

    async def is_token_revoked(self, jti: str) -> bool:
        return bool(await self._x("SELECT jti FROM revoked_tokens WHERE jti = ?", (jti,)))

    # ---- repositories ----
    @staticmethod
    def _repo(r: dict | None) -> dict | None:
        if not r:
            return None
        return {"id": str(r["repo_id"]), "owner_id": str(r["owner_id"]), "name": r["name"],
                "description": r["description"] or "", "visibility": r["visibility"],
                "default_branch": r["default_branch"], "created_at": _ts(r["created_at"]),
                "updated_at": _ts(r["updated_at"])}

    async def create_repo(self, r: dict) -> None:
        rid, oid, name = _u(r["id"]), _u(r["owner_id"]), r["name"].lower()
        ok, row = await self._applied(
            "INSERT INTO repositories_by_owner (owner_id, name, repo_id) VALUES (?, ?, ?) IF NOT EXISTS",
            (oid, name, rid))
        if not ok:
            existing = row.get("repo_id")
            if existing and await self.get_repo(str(existing)) is None:
                ok, _ = await self._applied(
                    "UPDATE repositories_by_owner SET repo_id = ? WHERE owner_id = ? AND name = ? IF repo_id = ?",
                    (rid, oid, name, existing))
            if not ok:
                raise Conflict("You already have a repository with this name", code="repo_name_taken")
        await self._x(
            "INSERT INTO repositories_by_id (repo_id, owner_id, name, description, visibility, "
            "default_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (rid, oid, r["name"], r["description"], r["visibility"], r["default_branch"],
             r["created_at"], r["updated_at"]))
        await self.set_member(r["id"], r["owner_id"], "owner")

    async def get_repo(self, repo_id: str) -> dict | None:
        rows = await self._x("SELECT * FROM repositories_by_id WHERE repo_id = ?", (_u(repo_id),))
        return self._repo(rows[0] if rows else None)

    async def list_repos_for_user(self, user_id: str) -> list[dict]:
        rows = await self._x("SELECT repo_id, role FROM repos_by_member WHERE user_id = ?", (_u(user_id),))
        repos = await asyncio.gather(*(self.get_repo(str(r["repo_id"])) for r in rows))
        out = [{**repo, "role": r["role"]} for repo, r in zip(repos, rows) if repo]
        return sorted(out, key=lambda r: r["created_at"], reverse=True)

    async def update_repo(self, repo_id: str, **fields) -> dict | None:
        cols = sorted(c for c in fields if c in REPO_COLS)
        if cols:
            sets = ", ".join(f"{c} = ?" for c in cols)
            await self._x(f"UPDATE repositories_by_id SET {sets} WHERE repo_id = ?",
                          tuple(fields[c] for c in cols) + (_u(repo_id),))
        return await self.get_repo(repo_id)

    async def delete_repo(self, repo_id: str) -> None:
        rid = _u(repo_id)
        repo = await self.get_repo(repo_id)
        for m in await self.list_members(repo_id):
            await self._x("DELETE FROM repos_by_member WHERE user_id = ? AND repo_id = ?", (_u(m["user_id"]), rid))
        await self._x("DELETE FROM members_by_repo WHERE repo_id = ?", (rid,))
        for t in ("branches_by_repo", "commits_by_repo", "analytics_results_by_repo"):
            await self._x(f"DELETE FROM {t} WHERE repo_id = ?", (rid,))  # table names are constants
        if repo:
            start = repo["created_at"]
            n = (utcnow().year - start.year) * 12 + utcnow().month - start.month + 1
            for b in _months_back(max(n, 1)):
                await self._x("DELETE FROM events_by_repo WHERE repo_id = ? AND bucket = ?", (rid, b))
            await self._x("DELETE FROM repositories_by_owner WHERE owner_id = ? AND name = ?",
                          (_u(repo["owner_id"]), repo["name"].lower()))
        await self._x("DELETE FROM repositories_by_id WHERE repo_id = ?", (rid,))

    # ---- members ----
    async def set_member(self, repo_id: str, user_id: str, role: str) -> None:
        rid, uid = _u(repo_id), _u(user_id)
        await self._x("INSERT INTO members_by_repo (repo_id, user_id, role, added_at) VALUES (?, ?, ?, ?)",
                      (rid, uid, role, utcnow()))
        await self._x("INSERT INTO repos_by_member (user_id, repo_id, role) VALUES (?, ?, ?)", (uid, rid, role))

    async def get_role(self, repo_id: str, user_id: str) -> str | None:
        rows = await self._x("SELECT role FROM members_by_repo WHERE repo_id = ? AND user_id = ?",
                             (_u(repo_id), _u(user_id)))
        return rows[0]["role"] if rows else None

    async def list_members(self, repo_id: str) -> list[dict]:
        rows = await self._x("SELECT user_id, role FROM members_by_repo WHERE repo_id = ?", (_u(repo_id),))
        return [{"repo_id": repo_id, "user_id": str(r["user_id"]), "role": r["role"]} for r in rows]

    async def remove_member(self, repo_id: str, user_id: str) -> None:
        await self._x("DELETE FROM members_by_repo WHERE repo_id = ? AND user_id = ?", (_u(repo_id), _u(user_id)))
        await self._x("DELETE FROM repos_by_member WHERE user_id = ? AND repo_id = ?", (_u(user_id), _u(repo_id)))

    # ---- activity ----
    async def add_event(self, repo_id: str, actor_id: str, type_: str, data: dict) -> dict:
        now = utcnow()
        eid = uuid_from_time(now)
        payload = json.dumps(data)
        b = month_bucket(now)
        await self._x("INSERT INTO events_by_repo (repo_id, bucket, event_id, type, actor_id, data) "
                      "VALUES (?, ?, ?, ?, ?, ?)", (_u(repo_id), b, eid, type_, _u(actor_id), payload))
        await self._x("INSERT INTO activity_by_user (user_id, bucket, event_id, repo_id, type, data) "
                      "VALUES (?, ?, ?, ?, ?, ?)", (_u(actor_id), b, eid, _u(repo_id), type_, payload))
        return {"id": str(eid), "repo_id": repo_id, "actor_id": actor_id, "type": type_, "data": data, "ts": now}

    @staticmethod
    def _ev(r: dict, repo_id=None, actor_id=None) -> dict:
        from cassandra.util import datetime_from_uuid1
        return {"id": str(r["event_id"]), "repo_id": str(r.get("repo_id") or repo_id),
                "actor_id": str(r.get("actor_id") or actor_id), "type": r["type"],
                "data": json.loads(r["data"] or "{}"),
                "ts": datetime_from_uuid1(r["event_id"]).replace(tzinfo=timezone.utc)}

    async def list_repo_events(self, repo_id: str, limit: int) -> list[dict]:
        out: list[dict] = []
        for b in _months_back(self.EVENT_MONTHS):
            rows = await self._x("SELECT * FROM events_by_repo WHERE repo_id = ? AND bucket = ? LIMIT ?",
                                 (_u(repo_id), b, limit - len(out)))
            out += [self._ev(r) for r in rows]
            if len(out) >= limit:
                break
        return out

    async def list_user_activity(self, user_id: str, limit: int) -> list[dict]:
        out: list[dict] = []
        for b in _months_back(self.EVENT_MONTHS):
            rows = await self._x("SELECT * FROM activity_by_user WHERE user_id = ? AND bucket = ? LIMIT ?",
                                 (_u(user_id), b, limit - len(out)))
            out += [self._ev(r, actor_id=user_id) for r in rows]
            if len(out) >= limit:
                break
        return out

    async def add_notification(self, user_id: str, type_: str, data: dict) -> None:
        now = utcnow()
        await self._x("INSERT INTO notifications_by_user (user_id, bucket, notification_id, type, data, read) "
                      "VALUES (?, ?, ?, ?, ?, false)",
                      (_u(user_id), month_bucket(now), uuid_from_time(now), type_, json.dumps(data)))

    async def list_notifications(self, user_id: str, limit: int) -> list[dict]:
        out: list[dict] = []
        for b in _months_back(3):
            rows = await self._x("SELECT * FROM notifications_by_user WHERE user_id = ? AND bucket = ? LIMIT ?",
                                 (_u(user_id), b, limit - len(out)))
            out += [{"id": str(r["notification_id"]), "type": r["type"], "data": json.loads(r["data"] or "{}"),
                     "read": r["read"]} for r in rows]
            if len(out) >= limit:
                break
        return out

    # ---- git metadata indexes ----
    async def index_commit(self, repo_id: str, c: dict) -> None:
        await self._x("INSERT INTO commits_by_repo (repo_id, committed_at, sha, branch, author_id, author_name, "
                      "message) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (_u(repo_id), c["committed_at"], c["sha"], c["branch"],
                       _u(c["author_id"]) if c.get("author_id") else None, c["author_name"], c["message"]))

    async def index_branch(self, repo_id: str, name: str, head_sha: str, created_by: str) -> None:
        await self._x("INSERT INTO branches_by_repo (repo_id, name, head_sha, created_by, created_at) "
                      "VALUES (?, ?, ?, ?, ?)", (_u(repo_id), name, head_sha, _u(created_by), utcnow()))

    async def list_indexed_commits(self, repo_id: str, limit: int) -> list[dict]:
        rows = await self._x("SELECT * FROM commits_by_repo WHERE repo_id = ? LIMIT ?", (_u(repo_id), limit))
        return [{**r, "repo_id": repo_id, "committed_at": _ts(r["committed_at"])} for r in rows]

    # ---- analytics ----
    @staticmethod
    def _job(r: dict | None) -> dict | None:
        if not r:
            return None
        return {"id": str(r["job_id"]), "user_id": str(r["user_id"]), "task_type": r["task_type"],
                "params": json.loads(r["params"] or "{}"), "repo_ids": json.loads(r["repo_ids"] or "[]"),
                "status": r["status"], "attempts": r["attempts"] or 0, "error": r["error"],
                "result": json.loads(r["result"]) if r["result"] else None,
                "metrics": json.loads(r["metrics"]) if r["metrics"] else None,
                "created_at": _ts(r["created_at"]), "updated_at": _ts(r["updated_at"]),
                "started_at": _ts(r["started_at"]), "finished_at": _ts(r["finished_at"])}

    async def create_job(self, j: dict) -> bool:
        ok, _ = await self._applied(
            "INSERT INTO analytics_jobs_by_id (job_id, user_id, task_type, params, repo_ids, status, attempts, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS",
            (_u(j["id"]), _u(j["user_id"]), j["task_type"], json.dumps(j["params"]), json.dumps(j["repo_ids"]),
             j["status"], j["attempts"], j["created_at"], j["created_at"]))
        if ok:
            await self._x("INSERT INTO analytics_jobs_by_user (user_id, created_at, job_id) VALUES (?, ?, ?)",
                          (_u(j["user_id"]), j["created_at"], _u(j["id"])))
            await self._x("INSERT INTO analytics_open_jobs (bucket, job_id) VALUES (0, ?)", (_u(j["id"]),))
        return ok

    async def get_job(self, job_id: str) -> dict | None:
        rows = await self._x("SELECT * FROM analytics_jobs_by_id WHERE job_id = ?", (_u(job_id),))
        return self._job(rows[0] if rows else None)

    async def update_job(self, job_id: str, **fields) -> dict | None:
        fields.setdefault("updated_at", utcnow())
        cols = sorted(c for c in fields if c in JOB_COLS)
        vals = [json.dumps(fields[c]) if c in JSON_JOB and fields[c] is not None else fields[c] for c in cols]
        sets = ", ".join(f"{c} = ?" for c in cols)
        await self._x(f"UPDATE analytics_jobs_by_id SET {sets} WHERE job_id = ?", tuple(vals) + (_u(job_id),))
        if fields.get("status") in ("succeeded", "failed", "cancelled"):
            await self._x("DELETE FROM analytics_open_jobs WHERE bucket = 0 AND job_id = ?", (_u(job_id),))
        return await self.get_job(job_id)

    async def list_jobs_for_user(self, user_id: str, limit: int) -> list[dict]:
        rows = await self._x("SELECT job_id FROM analytics_jobs_by_user WHERE user_id = ? LIMIT ?",
                             (_u(user_id), limit))
        jobs = await asyncio.gather(*(self.get_job(str(r["job_id"])) for r in rows))
        return [j for j in jobs if j]

    async def list_open_jobs(self) -> list[dict]:
        rows = await self._x("SELECT job_id FROM analytics_open_jobs WHERE bucket = 0", ())
        jobs = await asyncio.gather(*(self.get_job(str(r["job_id"])) for r in rows))
        return [j for j in jobs if j and j["status"] in ("queued", "dispatched", "running")]

    async def add_repo_result(self, repo_id: str, job_id: str, task_type: str, summary: dict) -> None:
        await self._x("INSERT INTO analytics_results_by_repo (repo_id, finished_at, job_id, task_type, summary) "
                      "VALUES (?, ?, ?, ?, ?)",
                      (_u(repo_id), utcnow(), _u(job_id), task_type, json.dumps(summary)))

    async def list_repo_results(self, repo_id: str, limit: int) -> list[dict]:
        rows = await self._x("SELECT * FROM analytics_results_by_repo WHERE repo_id = ? LIMIT ?",
                             (_u(repo_id), limit))
        return [{"job_id": str(r["job_id"]), "task_type": r["task_type"], "summary": json.loads(r["summary"]),
                 "finished_at": _ts(r["finished_at"])} for r in rows]
