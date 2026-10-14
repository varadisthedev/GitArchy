"""Repository storage abstraction. Local filesystem implementation only.

PRODUCTION NOTE: live bare Git repositories need a real POSIX filesystem that persists. Cloudflare R2
is object storage (not a filesystem) and Render's free disk is ephemeral. Use a persistent disk/volume
or a dedicated repo service behind this interface; R2 is for bundles/exports/backups only.
"""
import os
import shutil
import stat
import uuid
from pathlib import Path
from typing import Protocol

from app.utils.validators import parse_uuid


class RepositoryStorage(Protocol):
    def path_for(self, repo_id: str) -> Path: ...
    def exists(self, repo_id: str) -> bool: ...
    def remove(self, repo_id: str) -> None: ...


def _force_remove(func, path, _exc):
    """Git writes read-only object files; on Windows rmtree needs them made writable first."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


class LocalRepositoryStorage:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, repo_id: str) -> Path:
        """Server-generated path: <root>/<uuid>.git. Names, users and branches never reach the filesystem."""
        p = (self.root / f"{parse_uuid(repo_id, 'repository id')}.git").resolve()
        if p.parent != self.root:  # also defeats symlinked entries pointing elsewhere
            raise ValueError("repository path escapes storage root")
        return p

    def exists(self, repo_id: str) -> bool:
        return self.path_for(repo_id).is_dir()

    def remove(self, repo_id: str) -> None:
        p = self.path_for(repo_id)
        if p.is_dir() and not p.is_symlink():
            shutil.rmtree(p, onexc=_force_remove)

    @staticmethod
    def new_id() -> str:
        return str(uuid.uuid4())
