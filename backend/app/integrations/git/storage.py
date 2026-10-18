"""Where bare Git repositories sit on this instance's filesystem.

Git cannot read object storage - every command needs a real directory - so this is a *cache*, not the
record. The durable copy of each repository lives in object storage (integrations.git.mirror), which is
what makes an ephemeral disk survivable: anything missing here is pulled back on the next git command.
"""
import os
import shutil
import stat
from pathlib import Path

from app.utils.validators import parse_uuid


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
