"""In-memory Store. Only used when DATABASE_BACKEND=memory (dev/tests); refused in production.

Mirrors AstraStore's semantics (including uniqueness claims) so tests exercise the same contract.
"""
import asyncio
import time
from datetime import datetime, timezone

from app.core.exceptions import Conflict


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def month_bucket(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


class MemoryStore:
    kind = "memory"

    def __init__(self):
        self._lock = asyncio.Lock()
        self.users: dict[str, dict] = {}
        self.emails: dict[str, str] = {}
        self.revoked: dict[str, float] = {}
        self.repos: dict[str, dict] = {}
        self.owner_names: dict[tuple[str, str], str] = {}
        self.members: dict[tuple[str, str], str] = {}
        self.events: list[dict] = []
        self.notifications: list[dict] = []
        self.commits: dict[str, list[dict]] = {}
        self.branches: dict[str, dict[str, dict]] = {}
        self.jobs: dict[str, dict] = {}
        self.results: dict[str, list[dict]] = {}
        self._seq = 0

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    # ---- users ----
    async def create_user(self, user: dict) -> None:
        async with self._lock:
            if user["email"] in self.emails:
                raise Conflict("Email already registered", code="email_taken")
            self.emails[user["email"]] = user["id"]
            self.users[user["id"]] = dict(user)

    async def get_user(self, user_id: str) -> dict | None:
        u = self.users.get(user_id)
        return dict(u) if u else None

    async def get_user_by_email(self, email: str) -> dict | None:
        uid = self.emails.get(email)
        return await self.get_user(uid) if uid else None

    async def update_user(self, user_id: str, **fields) -> dict | None:
        async with self._lock:
            u = self.users.get(user_id)
            if not u:
                return None
            u.update(fields)
            return dict(u)

    # ---- token revocation ----
    async def revoke_token(self, jti: str, ttl_s: int) -> None:
        self.revoked[jti] = time.time() + max(ttl_s, 1)

    async def is_token_revoked(self, jti: str) -> bool:
        exp = self.revoked.get(jti)
        if exp is None:
            return False
        if exp < time.time():
            del self.revoked[jti]
            return False
        return True

    # ---- repositories ----
    async def create_repo(self, repo: dict) -> None:
        async with self._lock:
            key = (repo["owner_id"], repo["name"].lower())
            if key in self.owner_names:
                raise Conflict("You already have a repository with this name", code="repo_name_taken")
            self.owner_names[key] = repo["id"]
            self.repos[repo["id"]] = dict(repo)
            self.members[(repo["id"], repo["owner_id"])] = "owner"

    async def get_repo(self, repo_id: str) -> dict | None:
        r = self.repos.get(repo_id)
        return dict(r) if r else None

    async def list_repos_for_user(self, user_id: str) -> list[dict]:
        out = []
        for (rid, uid), role in self.members.items():
            if uid == user_id and rid in self.repos:
                out.append({**self.repos[rid], "role": role})
        return sorted(out, key=lambda r: r["created_at"], reverse=True)

    async def update_repo(self, repo_id: str, **fields) -> dict | None:
        async with self._lock:
            r = self.repos.get(repo_id)
            if not r:
                return None
            r.update(fields)
            return dict(r)

    async def delete_repo(self, repo_id: str) -> None:
        async with self._lock:
            r = self.repos.pop(repo_id, None)
            if r:
                self.owner_names.pop((r["owner_id"], r["name"].lower()), None)
            for k in [k for k in self.members if k[0] == repo_id]:
                del self.members[k]
            self.commits.pop(repo_id, None)
            self.branches.pop(repo_id, None)
            self.events = [e for e in self.events if e["repo_id"] != repo_id]
            self.results.pop(repo_id, None)

    # ---- members ----
    async def set_member(self, repo_id: str, user_id: str, role: str) -> None:
        self.members[(repo_id, user_id)] = role

    async def get_role(self, repo_id: str, user_id: str) -> str | None:
        return self.members.get((repo_id, user_id))

    async def list_members(self, repo_id: str) -> list[dict]:
        return [{"repo_id": r, "user_id": u, "role": role}
                for (r, u), role in self.members.items() if r == repo_id]

    async def remove_member(self, repo_id: str, user_id: str) -> None:
        self.members.pop((repo_id, user_id), None)

    # ---- activity ----
    async def add_event(self, repo_id: str, actor_id: str, type_: str, data: dict) -> dict:
        self._seq += 1
        ev = {"id": f"{time.time_ns()}-{self._seq}", "repo_id": repo_id, "actor_id": actor_id,
              "type": type_, "data": data, "ts": utcnow(), "_seq": self._seq}
        self.events.append(ev)
        return ev

    async def list_repo_events(self, repo_id: str, limit: int) -> list[dict]:
        evs = [e for e in self.events if e["repo_id"] == repo_id]
        return sorted(evs, key=lambda e: e["_seq"], reverse=True)[:limit]

    async def list_user_activity(self, user_id: str, limit: int) -> list[dict]:
        evs = [e for e in self.events if e["actor_id"] == user_id]
        return sorted(evs, key=lambda e: e["_seq"], reverse=True)[:limit]

    async def add_notification(self, user_id: str, type_: str, data: dict) -> None:
        self._seq += 1
        self.notifications.append({"id": str(self._seq), "user_id": user_id, "type": type_,
                                   "data": data, "read": False, "ts": utcnow()})

    async def list_notifications(self, user_id: str, limit: int) -> list[dict]:
        return [n for n in reversed(self.notifications) if n["user_id"] == user_id][:limit]

    # ---- git metadata indexes ----
    async def index_commit(self, repo_id: str, c: dict) -> None:
        self.commits.setdefault(repo_id, []).append(dict(c))

    async def index_branch(self, repo_id: str, name: str, head_sha: str, created_by: str) -> None:
        self.branches.setdefault(repo_id, {})[name] = {"name": name, "head_sha": head_sha,
                                                       "created_by": created_by}

    async def list_indexed_commits(self, repo_id: str, limit: int) -> list[dict]:
        cs = sorted(self.commits.get(repo_id, []), key=lambda c: c["committed_at"], reverse=True)
        return cs[:limit]

    # ---- analytics ----
    async def create_job(self, job: dict) -> bool:
        async with self._lock:
            if job["id"] in self.jobs:
                return False
            self.jobs[job["id"]] = dict(job)
            return True

    async def get_job(self, job_id: str) -> dict | None:
        j = self.jobs.get(job_id)
        return dict(j) if j else None

    async def update_job(self, job_id: str, **fields) -> dict | None:
        async with self._lock:
            j = self.jobs.get(job_id)
            if not j:
                return None
            j.update(fields, updated_at=utcnow())
            return dict(j)

    async def list_jobs_for_user(self, user_id: str, limit: int) -> list[dict]:
        js = [dict(j) for j in self.jobs.values() if j["user_id"] == user_id]
        return sorted(js, key=lambda j: j["created_at"], reverse=True)[:limit]

    async def list_open_jobs(self) -> list[dict]:
        open_ = ("queued", "dispatched", "running")
        return [dict(j) for j in self.jobs.values() if j["status"] in open_]

    async def add_repo_result(self, repo_id: str, job_id: str, task_type: str, summary: dict) -> None:
        self.results.setdefault(repo_id, []).append(
            {"job_id": job_id, "task_type": task_type, "summary": summary, "finished_at": utcnow()})

    async def list_repo_results(self, repo_id: str, limit: int) -> list[dict]:
        return list(reversed(self.results.get(repo_id, [])))[:limit]
