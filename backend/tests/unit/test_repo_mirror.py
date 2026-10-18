"""Object storage is the repository; the disk is a cache. These tests wipe the disk and expect nothing lost."""
from pathlib import Path

import pytest

from app.core.exceptions import Unavailable
from app.integrations.astra.memory import MemoryStore, utcnow
from app.integrations.git.manager import GitManager
from app.integrations.git.mirror import RepoMirror, key_for
from app.integrations.git.storage import LocalRepositoryStorage
from app.integrations.r2.client import R2Client
from tests.conftest import make_settings, requires_git
from tests.unit.test_integrations_mocked import FakeS3, r2_settings

pytestmark = requires_git


class DiskS3(FakeS3):
    """FakeS3 plus the two file operations the mirror needs."""

    def upload_file(self, path, Bucket, Key, ExtraArgs):
        self.objects[Key] = (Path(path).read_bytes(), ExtraArgs["ContentType"], ExtraArgs["Metadata"])

    def download_file(self, Bucket, Key, path):
        if Key not in self.objects:
            raise KeyError(Key)
        Path(path).write_bytes(self.objects[Key][0])


@pytest.fixture
def git_with_mirror(tmp_path):
    settings = make_settings(tmp_path)
    storage = LocalRepositoryStorage(settings.git_repos_dir)
    git = GitManager(settings, storage)
    store = MemoryStore()
    s3 = DiskS3()
    git.mirror = RepoMirror(R2Client(r2_settings(tmp_path), s3=s3), store, storage)
    return git, store, storage, s3


async def _repo(store, repo_id="11111111-1111-1111-1111-111111111111"):
    await store.create_repo({"id": repo_id, "owner_id": "22222222-2222-2222-2222-222222222222",
                             "name": "notes", "description": "", "visibility": "private",
                             "default_branch": "main", "created_at": utcnow(), "updated_at": utcnow()})
    return repo_id


async def test_a_wiped_disk_loses_nothing(git_with_mirror):
    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes\n", "Dev", "dev@example.com")
    sha = await git.commit_files(rid, "main", [("a.txt", b"one\n")], "add a", "Dev", "dev@example.com")
    assert key_for(rid) in s3.objects                       # every write is pushed through
    assert (await store.get_repo(rid))["storage_sha"]

    storage.remove(rid)                                     # what a restart does on Render
    assert not storage.exists(rid)

    log = await git.log(rid, "main", 10)                    # a plain read pulls it back
    assert storage.exists(rid) and [c["sha"] for c in log][0] == sha
    assert (await git.read_file(rid, "main", "a.txt"))["content"].strip() == "one"
    assert sorted(b["name"] for b in await git.list_branches(rid)) == ["main"]


async def test_the_snapshot_is_the_latest_write(git_with_mirror):
    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes\n", "Dev", "dev@example.com")
    await git.create_branch(rid, "feature", "main")
    second = await git.commit_files(rid, "main", [("b.txt", b"two\n")], "add b", "Dev", "dev@example.com")

    storage.remove(rid)
    assert [c["sha"] for c in await git.log(rid, "main", 10)][0] == second
    assert sorted(b["name"] for b in await git.list_branches(rid)) == ["feature", "main"]


async def test_corruption_is_refused_rather_than_unpacked(git_with_mirror):
    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes\n", "Dev", "dev@example.com")
    storage.remove(rid)
    body, ctype, meta = s3.objects[key_for(rid)]
    s3.objects[key_for(rid)] = (body[:-64] + b"x" * 64, ctype, meta)   # truncate and pad

    with pytest.raises(Unavailable):
        await git.log(rid, "main", 10)
    assert not storage.exists(rid)   # a bad archive must never half-land


async def test_a_repository_with_no_snapshot_says_so(git_with_mirror):
    git, store, storage, _ = git_with_mirror
    rid = await _repo(store)   # metadata only: never initialised, never stored
    with pytest.raises(Unavailable) as e:
        await git.log(rid, "main", 10)
    assert e.value.code == "repo_storage_unavailable"


async def test_concurrent_snapshots_leave_object_and_hash_agreeing(git_with_mirror):
    """Uploads finishing in one order and recording hashes in the other would fail every later read."""
    import asyncio

    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes", "Dev", "dev@example.com")
    for i in range(3):
        await git.commit_files(rid, "main", [(f"f{i}.txt", b"x")], f"c{i}", "Dev", "dev@example.com")

    await asyncio.gather(*(git.mirror.snapshot(rid) for _ in range(5)))

    import hashlib
    stored = hashlib.sha256(s3.objects[key_for(rid)][0]).hexdigest()
    assert stored == (await store.get_repo(rid))["storage_sha"]
    storage.remove(rid)
    await git.log(rid, "main", 10)   # and the pair is actually usable


async def test_a_snapshot_cannot_resurrect_a_deleted_repository(git_with_mirror):
    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes", "Dev", "dev@example.com")
    await store.delete_repo(rid)
    await git.mirror.forget(rid)

    await git.mirror.snapshot(rid)   # a write that was already in flight when the delete landed

    assert await store.get_repo(rid) is None   # the row must not come back as an upsert
    assert key_for(rid) not in s3.objects      # nor the data of a deleted repository
    # and the conditional write refuses on its own, for a delete that lands mid-upload
    assert await store.set_repo_storage(rid, 'k', 'sha', utcnow()) is False


async def test_forget_destroys_the_durable_copy(git_with_mirror):
    git, store, storage, s3 = git_with_mirror
    rid = await _repo(store)
    await git.init_repo(rid, "main", b"# notes\n", "Dev", "dev@example.com")
    await git.forget(rid)
    assert not storage.exists(rid) and key_for(rid) not in s3.objects
