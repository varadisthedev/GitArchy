"""Native Git operations. Git is the source of truth; this module only shells out to the real `git`.

Safety rules enforced here:
- subprocess with an argv list, never a shell; user data only as values after `--`/`--end-of-options`
  or as stdin, and only after allow-list validation (app.utils.validators)
- repository path comes from LocalRepositoryStorage (uuid), never from user input
- commits are built with plumbing against a temporary index: no working tree is ever checked out,
  so symlinks/hooks/filters in repository content are never followed or executed
- timeouts, output caps, sanitized public errors, per-repository write lock
"""
import asyncio
import base64
import logging
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.core.exceptions import AppError, Conflict, NotFound, PayloadTooLarge
from app.integrations.git.storage import LocalRepositoryStorage
from app.utils.validators import InvalidInput, validate_branch, validate_path, validate_ref

log = logging.getLogger("gitarchey.git")

ZERO_SHA = "0" * 40
_SHA40 = re.compile(r"^[0-9a-f]{40}$")


class GitError(AppError):
    status, code = 500, "git_error"


class GitTimeout(GitError):
    status, code = 504, "git_timeout"


@dataclass
class Result:
    rc: int
    out: bytes
    err: bytes


def _clean_ident(s: str) -> str:
    s = re.sub(r"[<>\r\n\x00]", "", s).strip()
    return s[:100] or "user"


class GitManager:
    def __init__(self, settings: Settings, storage: LocalRepositoryStorage):
        self.cfg, self.storage = settings, storage
        # set at startup when object storage is configured: the durable copy of every repository.
        # None keeps the old behaviour (disk only), which is what local development and tests use.
        self.mirror = None
        self._locks: dict[str, asyncio.Lock] = {}
        self._base_env = {
            k: v for k, v in os.environ.items()
            if k in ("PATH", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "WINDIR")}
        self._base_env.update({
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_TERMINAL_PROMPT": "0",
            "LC_ALL": "C", "GIT_OPTIONAL_LOCKS": "0"})

    # ------------------------------------------------------------ plumbing
    def lock(self, repo_id: str) -> asyncio.Lock:
        # ponytail: process-local lock; multi-instance deployments need a distributed lock or a single repo host
        return self._locks.setdefault(repo_id, asyncio.Lock())

    def version(self) -> str:
        r = self._run_sync(None, ["--version"])
        return r.out.decode(errors="replace").strip()

    def _run_sync(self, repo_id: str | None, args: list[str], input: bytes | None = None,
                  env: dict | None = None, timeout: float | None = None) -> Result:
        argv = [self.cfg.git_executable]
        if repo_id is not None:
            argv.append(f"--git-dir={self.storage.path_for(repo_id)}")
        argv += args
        full_env = {**self._base_env, **(env or {})}
        try:
            p = subprocess.run(argv, input=input, capture_output=True,
                               timeout=timeout or self.cfg.git_timeout_s,
                               env=full_env, shell=False, cwd=tempfile.gettempdir())
        except subprocess.TimeoutExpired:
            log.warning("git_failure", extra={"category": "timeout", "op": args[0]})
            raise GitTimeout("Git operation timed out") from None
        except OSError:
            log.error("git_failure", extra={"category": "spawn", "op": args[0]})
            raise GitError("Git is unavailable") from None
        if len(p.stdout) > self.cfg.git_max_output_bytes:
            log.warning("git_failure", extra={"category": "output_too_large", "op": args[0]})
            raise PayloadTooLarge("Git output too large", code="output_too_large")
        return Result(p.returncode, p.stdout, p.stderr)

    async def _run(self, repo_id: str | None, args: list[str], **kw) -> Result:
        # every read and write for a repository passes through here, so this is the one place that has
        # to know the disk is only a cache. Creation paths pass repo_id=None and are unaffected.
        if repo_id is not None and self.mirror and not self.storage.exists(repo_id):
            await self.mirror.rehydrate(repo_id)
        return await asyncio.to_thread(self._run_sync, repo_id, args, **kw)

    async def _snapshot(self, repo_id: str) -> None:
        """Make the change durable before the caller is told it succeeded."""
        if self.mirror:
            await self.mirror.snapshot(repo_id)

    async def forget(self, repo_id: str) -> None:
        """Delete a repository for good: the cached copy and the durable one."""
        self.delete_repo(repo_id)
        if self.mirror:
            await self.mirror.forget(repo_id)

    def _fail(self, op: str, r: Result, category: str = "failed") -> GitError:
        log.warning("git_failure", extra={"category": category, "op": op, "rc": r.rc})
        return GitError("Git operation failed")

    async def _ok(self, repo_id, args, **kw) -> bytes:
        r = await self._run(repo_id, args, **kw)
        if r.rc != 0:
            raise self._fail(args[0], r)
        return r.out

    # ------------------------------------------------------------ resolve
    async def resolve(self, repo_id: str, ref: str) -> str:
        """Branch name or hex commit id -> full commit sha. Raises NotFound."""
        validate_ref(ref)
        candidates = [f"refs/heads/{ref}^{{commit}}"]
        if re.fullmatch(r"[0-9a-f]{4,64}", ref):
            candidates.append(f"{ref}^{{commit}}")
        for c in candidates:
            r = await self._run(repo_id, ["rev-parse", "--verify", "--quiet", "--end-of-options", c])
            sha = r.out.decode().strip()
            if r.rc == 0 and _SHA40.fullmatch(sha):
                return sha
        raise NotFound("Revision not found", code="revision_not_found")

    # ------------------------------------------------------------ init / delete
    async def init_repo(self, repo_id: str, default_branch: str, readme: bytes,
                        author_name: str, author_email: str) -> str:
        validate_branch(default_branch)
        path = self.storage.path_for(repo_id)
        if path.exists():
            raise Conflict("Repository storage already exists")
        r = await self._run(None, ["init", "--bare", "--quiet", "--template=",
                                   f"--initial-branch={default_branch}", str(path)])
        if r.rc != 0:
            raise self._fail("init", r)
        return await self.commit_files(repo_id, default_branch, [("README.md", readme)],
                                       "Initial commit", author_name, author_email, allow_root=True)

    async def clone_bare(self, repo_id: str, clone_url: str, token: str | None = None) -> str:
        """Mirror a remote's history into this repo's storage. Returns the cloned HEAD branch name.

        The credential travels in the environment (GIT_CONFIG_* -> http.extraHeader), never in argv,
        so the token is not exposed in the process list. Nothing from the remote is checked out or
        executed: a bare clone runs no hooks and `--template=` keeps the samples out too.

        `clone_url` must already be vetted by the caller: this wrapper hands it to git as-is, so the
        transport allow-list lives where the URL enters the system (modules.github.service).
        """
        path = self.storage.path_for(repo_id)
        if path.exists():
            raise Conflict("Repository storage already exists")
        env = {}
        if token:
            basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
            env = {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.extraHeader",
                   "GIT_CONFIG_VALUE_0": f"Authorization: Basic {basic}"}
        r = await self._run(None, ["clone", "--bare", "--quiet", "--template=",
                                   "--end-of-options", clone_url, str(path)],
                            env=env, timeout=self.cfg.github_clone_timeout_s)
        if r.rc != 0:
            self.storage.remove(repo_id)  # a partial clone must not look like a real repository
            log.warning("git_clone_failed", extra={"repo_id": repo_id, "rc": r.rc})
            raise GitError("Could not clone the repository from its remote", code="clone_failed")
        head = await self._run(repo_id, ["symbolic-ref", "--short", "--quiet", "HEAD"])
        branch = head.out.decode(errors="replace").strip()
        if not branch:  # detached or empty remote: nothing to serve
            self.storage.remove(repo_id)
            raise InvalidInput("The repository has no branches to import", code="remote_empty")
        await self._snapshot(repo_id)   # an import is durable the moment it lands, not on first edit
        return branch

    def delete_repo(self, repo_id: str) -> None:
        """Drop the cached copy only. The durable copy in object storage is untouched: see forget()."""
        self.storage.remove(repo_id)
        self._locks.pop(repo_id, None)

    # ------------------------------------------------------------ branches
    async def list_branches(self, repo_id: str) -> list[dict]:
        out = await self._ok(repo_id, ["for-each-ref", "--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)",
                                       "refs/heads"])
        rows = []
        for line in out.decode(errors="replace").splitlines():
            name, sha, date = line.split("\t")
            rows.append({"name": name, "sha": sha, "updated_at": date})
        return sorted(rows, key=lambda b: b["name"])

    async def create_branch(self, repo_id: str, name: str, from_ref: str) -> str:
        validate_branch(name)
        async with self.lock(repo_id):
            chk = await self._run(None, ["check-ref-format", f"refs/heads/{name}"])
            if chk.rc != 0:
                raise InvalidInput("Invalid branch name")
            sha = await self.resolve(repo_id, from_ref)
            r = await self._run(repo_id, ["update-ref", f"refs/heads/{name}", sha, ZERO_SHA])
            if r.rc != 0:  # old-value of zero => ref already exists (or D/F ref conflict)
                raise Conflict("Branch already exists", code="branch_exists")
        await self._snapshot(repo_id)
        return sha

    # ------------------------------------------------------------ read
    async def tree(self, repo_id: str, ref: str, path: str = "") -> dict:
        path = validate_path(path, allow_empty=True)
        sha = await self.resolve(repo_id, ref)
        spec = f"{sha}:{path}" if path else sha
        r = await self._run(repo_id, ["ls-tree", "-z", "-l", "--end-of-options", spec])
        if r.rc != 0:
            raise NotFound("Path not found", code="path_not_found")
        entries = []
        for rec in r.out.split(b"\x00"):
            if not rec:
                continue
            meta, _, name = rec.partition(b"\t")
            mode, typ, osha, size = meta.decode().split(None, 3)
            entries.append({"name": name.decode("utf-8", "replace"), "type": "symlink" if mode == "120000" else
                            {"blob": "file", "tree": "dir", "commit": "submodule"}.get(typ, typ),
                            "mode": mode, "sha": osha, "size": None if size.strip() == "-" else int(size)})
        entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
        return {"ref": ref, "commit": sha, "path": path, "entries": entries}

    async def read_file(self, repo_id: str, ref: str, path: str) -> dict:
        path = validate_path(path)
        sha = await self.resolve(repo_id, ref)
        spec = f"{sha}:{path}"
        t = await self._run(repo_id, ["ls-tree", "-z", "-l", "--end-of-options", sha, "--", path])
        line = t.out.split(b"\x00")[0]
        if t.rc != 0 or not line:
            raise NotFound("File not found", code="path_not_found")
        meta = line.partition(b"\t")[0].decode().split(None, 3)
        mode, typ, size = meta[0], meta[1], int(meta[3])
        if typ != "blob":
            raise InvalidInput("Path is not a file")
        if size > self.cfg.git_max_file_bytes:
            raise PayloadTooLarge("File too large to display", code="file_too_large")
        data = await self._ok(repo_id, ["cat-file", "blob", spec])
        try:
            content, enc = data.decode("utf-8"), "utf-8"
        except UnicodeDecodeError:
            content, enc = base64.b64encode(data).decode(), "base64"
        return {"path": path, "ref": ref, "commit": sha, "size": size, "encoding": enc,
                "content": content, "is_symlink": mode == "120000"}

    async def log(self, repo_id: str, ref: str, limit: int, skip: int = 0, path: str | None = None) -> list[dict]:
        sha = await self.resolve(repo_id, ref)
        args = ["log", f"--max-count={int(limit)}", f"--skip={int(skip)}", "--no-color",
                "--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%s%x1e", sha]
        if path:
            args += ["--", validate_path(path)]
        out = (await self._ok(repo_id, args)).decode("utf-8", "replace")
        commits = []
        for rec in out.split("\x1e"):
            rec = rec.strip("\n")
            if not rec:
                continue
            h, an, ae, date, parents, subject = rec.split("\x1f")
            commits.append({"sha": h, "author_name": an, "author_email": ae, "date": date,
                            "parents": parents.split(), "message": subject})
        return commits

    async def diff(self, repo_id: str, base: str, head: str, path: str | None = None) -> dict:
        a, b = await self.resolve(repo_id, base), await self.resolve(repo_id, head)
        tail = ["--", validate_path(path)] if path else []
        common = ["--no-color", "--no-ext-diff", "--no-textconv", "-M"]
        stat = await self._ok(repo_id, ["diff", "--numstat", "-z", *common, a, b, *tail])
        patch = await self._ok(repo_id, ["diff", *common, a, b, *tail])
        truncated = len(patch) > self.cfg.git_max_diff_bytes
        patch = patch[: self.cfg.git_max_diff_bytes]
        files = []
        toks = stat.split(b"\x00")
        i = 0
        while i < len(toks) and toks[i]:
            add, dele, name = toks[i].decode("utf-8", "replace").split("\t", 2)
            if name == "":  # rename: next two tokens are old, new
                name = toks[i + 2].decode("utf-8", "replace")
                i += 2
            files.append({"path": name, "additions": None if add == "-" else int(add),
                          "deletions": None if dele == "-" else int(dele), "binary": add == "-"})
            i += 1
        return {"base": a, "head": b, "files": files, "patch": patch.decode("utf-8", "replace"),
                "truncated": truncated}

    async def analytics_log(self, repo_id: str, ref: str, max_rows: int) -> list[dict]:
        """Commit rows with per-commit numstat totals, for analytics datasets (bounded)."""
        sha = await self.resolve(repo_id, ref)
        out = (await self._ok(repo_id, ["log", f"--max-count={int(max_rows)}", "--numstat", "--no-color",
                                        "--format=%x1e%H%x1f%an%x1f%aI%x1f%s", sha])).decode("utf-8", "replace")
        rows = []
        for rec in out.split("\x1e"):
            if not rec.strip():
                continue
            head, _, stats = rec.partition("\n")
            h, an, date, subject = head.split("\x1f")
            adds = dels = files = 0
            exts: dict[str, int] = {}
            for ln in stats.splitlines():
                parts = ln.split("\t")
                if len(parts) == 3:
                    files += 1
                    adds += int(parts[0]) if parts[0].isdigit() else 0
                    dels += int(parts[1]) if parts[1].isdigit() else 0
                    ext = os.path.splitext(parts[2])[1].lower() or "(none)"
                    exts[ext] = exts.get(ext, 0) + 1
            rows.append({"sha": h, "author": an, "date": date, "message": subject[:200],
                         "additions": adds, "deletions": dels, "files_changed": files, "extensions": exts})
        return rows

    # ------------------------------------------------------------ write
    async def commit_files(self, repo_id: str, branch: str, changes: list[tuple[str, bytes | None]],
                           message: str, author_name: str, author_email: str,
                           expected_parent: str | None = None, allow_root: bool = False) -> str:
        """Create one commit on `branch` from (path, content|None-for-delete) changes. Returns new commit sha."""
        validate_branch(branch)
        paths = [validate_path(p) for p, _ in changes]
        if len(set(paths)) != len(paths):
            raise InvalidInput("Duplicate paths in commit")
        async with self.lock(repo_id):
            r = await self._run(repo_id, ["rev-parse", "--verify", "--quiet", f"refs/heads/{branch}^{{commit}}"])
            parent = r.out.decode().strip() if r.rc == 0 else None
            if parent is None and not allow_root:
                raise NotFound("Branch not found", code="branch_not_found")
            if expected_parent and parent and not parent.startswith(expected_parent):
                raise Conflict("Branch has moved since you loaded it", code="stale_parent")
            ident = {"GIT_AUTHOR_NAME": _clean_ident(author_name), "GIT_AUTHOR_EMAIL": author_email,
                     "GIT_COMMITTER_NAME": "Gitarchey", "GIT_COMMITTER_EMAIL": self.cfg.git_author_email}
            with tempfile.TemporaryDirectory(prefix="gitarchey-idx-") as tmp:
                env = {"GIT_INDEX_FILE": str(Path(tmp) / "index"), **ident}
                if parent:
                    await self._ok(repo_id, ["read-tree", parent], env=env)
                for (path, content) in zip(paths, (c for _, c in changes)):
                    if content is None:
                        # mode 0 + zero sha removes an entry (--force-remove needs a work tree; bare repos have none)
                        r = await self._run(repo_id, ["update-index", "--index-info"], env=env,
                                            input=f"0 {ZERO_SHA}\t{path}\n".encode())
                        if r.rc != 0:
                            raise self._fail("update-index", r)
                        continue
                    if len(content) > self.cfg.git_max_file_bytes:
                        raise PayloadTooLarge("File too large", code="file_too_large")
                    blob = (await self._ok(repo_id, ["hash-object", "-w", "--no-filters", "--stdin"],
                                           input=content, env=env)).decode().strip()
                    mode = "100644"
                    if parent:
                        ex = await self._run(repo_id, ["ls-tree", "-z", parent, "--", path])
                        if ex.rc == 0 and ex.out:
                            old = ex.out.split(b" ", 1)[0].decode()
                            mode = "100755" if old == "100755" else "100644"
                    r = await self._run(repo_id, ["update-index", "--add", "--cacheinfo",
                                                  f"{mode},{blob},{path}"], env=env)
                    if r.rc != 0:  # e.g. path collides with an existing file/dir
                        raise Conflict("Path conflicts with an existing file or directory", code="path_conflict")
                tree = (await self._ok(repo_id, ["write-tree"], env=env)).decode().strip()
            if parent:
                ptree = (await self._ok(repo_id, ["rev-parse", f"{parent}^{{tree}}"])).decode().strip()
                if ptree == tree:
                    raise InvalidInput("No changes to commit", code="nothing_to_commit")
            args = ["commit-tree", tree] + (["-p", parent] if parent else []) + ["-F", "-"]
            new = (await self._ok(repo_id, args, input=message.encode("utf-8"), env=ident)).decode().strip()
            r = await self._run(repo_id, ["update-ref", f"refs/heads/{branch}", new, parent or ZERO_SHA])
            if r.rc != 0:
                raise Conflict("Branch was updated concurrently", code="stale_parent")
        await self._snapshot(repo_id)   # outside the lock: the ref is already written
        return new

    # ------------------------------------------------------------ export
    async def create_bundle(self, repo_id: str, dest: Path) -> None:
        """Self-contained snapshot (all refs). Verified with `git bundle verify` before it is handed to R2."""
        await self._ok(repo_id, ["bundle", "create", str(dest), "--all"])
        v = await self._run(repo_id, ["bundle", "verify", str(dest)])
        if v.rc != 0:
            raise self._fail("bundle-verify", v, "integrity")
