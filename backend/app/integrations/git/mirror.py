"""Object storage is where a repository lives; the instance's disk is a cache of it.

Git needs a real filesystem - no git command can read a bucket - so the durable copy is a tar of the
bare repository, written after every change and unpacked again whenever the disk doesn't have it.
On a host with an ephemeral disk (Render's free tier) that makes restarts survivable: the first read
after a restart pays one download, and nothing is lost.

Tar rather than `git bundle`: a bundle is a stream of refs and objects, while the tar is the directory
itself, so HEAD, packed-refs and config come back exactly as they were.
"""
import asyncio
import hashlib
import logging
import tarfile
import tempfile
from pathlib import Path

from app.core.exceptions import Unavailable
from app.integrations.astra.memory import utcnow

log = logging.getLogger("gitarchey.mirror")


def key_for(repo_id: str) -> str:
    return f"repositories/{repo_id}/repo.tar"


def _pack(src: Path, dest: Path) -> str:
    """Tar the bare repository and return its sha256. Blocking; call in a thread."""
    with tarfile.open(dest, "w") as t:
        t.add(src, arcname="repo.git", recursive=True)
    h = hashlib.sha256()
    with open(dest, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _unpack(archive: Path, into: Path, expected_sha: str | None) -> None:
    """Verify, extract beside the target, then move into place. Blocking; call in a thread."""
    if expected_sha:
        h = hashlib.sha256()
        with open(archive, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        if h.hexdigest() != expected_sha:
            raise Unavailable("The stored copy of this repository is corrupt", code="snapshot_corrupt")
    staging = into.with_name(into.name + ".incoming")
    with tarfile.open(archive, "r") as t:
        # filter="data" refuses absolute paths, links out of the tree and device files. We wrote this
        # archive ourselves, but it arrives over the network and extraction runs as the server.
        t.extractall(staging, filter="data")
    (staging / "repo.git").rename(into)   # only now does storage.exists() become true
    staging.rmdir()


class RepoMirror:
    """Durable copy of each repository in object storage, keyed by repository id."""

    def __init__(self, r2, store, storage):
        self.r2, self.store, self.storage = r2, store, storage
        # separate from GitManager's locks: rehydrate runs *inside* a git call that may hold one
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, repo_id: str) -> asyncio.Lock:
        return self._locks.setdefault(repo_id, asyncio.Lock())

    async def snapshot(self, repo_id: str) -> None:
        """Write the current state to object storage. Called after every change to a repository."""
        path = self.storage.path_for(repo_id)
        if not path.is_dir():
            return
        with tempfile.TemporaryDirectory(prefix="gitarchey-snap-") as tmp:
            archive = Path(tmp) / "repo.tar"
            sha = await asyncio.to_thread(_pack, path, archive)
            size = archive.stat().st_size
            key = key_for(repo_id)
            try:
                await self.r2.upload_file(key, archive, "application/x-tar", {"repo_id": repo_id})
            except Exception as e:
                # the change is on disk but not durable, and this host's disk does not survive a
                # restart. Say so rather than report success for something that may vanish.
                log.error("repo_snapshot_failed", extra={"repo_id": repo_id, "error": str(e)[:200]})
                raise Unavailable("The change was made but object storage is unreachable, so it is not "
                                  "saved durably yet. Try again once storage is back.",
                                  code="storage_unreachable") from None
        await self.store.update_repo(repo_id, storage_key=key, storage_sha=sha, storage_at=utcnow())
        log.info("repo_snapshot", extra={"repo_id": repo_id, "bytes": size})

    async def rehydrate(self, repo_id: str) -> None:
        """Put the repository back on disk from object storage. No-op when it is already there."""
        async with self._lock(repo_id):
            if self.storage.exists(repo_id):   # another caller won the race while we waited
                return
            repo = await self.store.get_repo(repo_id)
            if not repo or not repo.get("storage_key"):
                raise Unavailable("This repository's Git data is not on this server and no stored copy "
                                  "exists to restore it from", code="repo_storage_unavailable")
            with tempfile.TemporaryDirectory(prefix="gitarchey-pull-") as tmp:
                archive = Path(tmp) / "repo.tar"
                try:
                    size = await self.r2.download_file(repo["storage_key"], archive)
                except Exception as e:
                    log.error("repo_rehydrate_failed", extra={"repo_id": repo_id, "error": str(e)[:200]})
                    raise Unavailable("This repository is stored in object storage, which is unreachable "
                                      "right now.", code="storage_unreachable") from None
                await asyncio.to_thread(_unpack, archive, self.storage.path_for(repo_id),
                                        repo.get("storage_sha"))
            log.info("repo_rehydrated", extra={"repo_id": repo_id, "bytes": size})

    async def forget(self, repo_id: str) -> None:
        """Destroy the durable copy. Only for a repository the user actually deleted."""
        try:
            await self.r2.delete(key_for(repo_id))
        except Exception:  # the row is already gone; a stray object is garbage, not a failure
            log.warning("repo_snapshot_delete_failed", extra={"repo_id": repo_id})
