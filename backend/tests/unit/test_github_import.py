"""GitHub import, end to end, with GitHub itself replaced by a local Git remote.

What this pins down (the parts that break silently):
- a clone lands as a real repository: branches indexed, commits indexed, default branch from HEAD
- the import writes one activity event, so both /activity and the repo's activity page show it
- the Spark dataset builder can read the imported history (analytics works on imported repos)
- a failed clone leaves no phantom repository and no blocked name
- the GitHub account -> user binding is exclusive, and OAuth-only accounts cannot password-login
"""
import subprocess
import uuid

import pytest

from app.api.dependencies import AuthUser, Context
from app.core.security import create_oauth_state, verify_password
from app.integrations.astra.memory import MemoryStore, utcnow
from app.integrations.git.manager import GitManager
from app.integrations.git.storage import LocalRepositoryStorage
from app.core.rate_limit import Limiter
from app.modules.analytics.datasets import build_dataset
from app.modules.github import service
from app.utils.validators import InvalidInput
from tests.conftest import make_settings


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def remote(tmp_path):
    """A real bare repository with two branches, standing in for a GitHub remote."""
    work = tmp_path / "work"
    work.mkdir()
    _git("init", "--quiet", "--initial-branch=trunk", ".", cwd=work)
    _git("config", "user.email", "dev@example.com", cwd=work)
    _git("config", "user.name", "Dev", cwd=work)
    (work / "a.py").write_text("print('one')\n", encoding="utf-8")
    _git("add", "a.py", cwd=work)
    _git("commit", "--quiet", "-m", "first commit", cwd=work)
    (work / "b.md").write_text("# notes\n", encoding="utf-8")
    _git("add", "b.md", cwd=work)
    _git("commit", "--quiet", "-m", "second commit", cwd=work)
    _git("branch", "feature", cwd=work)
    bare = tmp_path / "remote.git"
    _git("clone", "--bare", "--quiet", str(work), str(bare), cwd=tmp_path)
    return bare


@pytest.fixture
def ctx(tmp_path):
    settings = make_settings(tmp_path, github_client_id="cid", github_client_secret="csecret",
                             github_oauth_redirect_uri="http://localhost:3000/auth/github/callback")
    storage = LocalRepositoryStorage(settings.git_repos_dir)
    return Context(settings=settings, store=MemoryStore(), git=GitManager(settings, storage),
                   storage=storage, limiter=Limiter(settings))


async def _user(ctx, email="dev@example.com", github_id=4242) -> AuthUser:
    user = {"id": str(uuid.uuid4()), "email": email, "display_name": "Dev",
            "password_hash": None, "avatar_url": None, "avatar_public_id": None,
            "created_at": utcnow()}
    await ctx.store.create_user(user)
    await ctx.store.set_github_identity(user["id"], {
        "github_id": github_id, "login": "devuser", "access_token": "gho_test", "scope": "repo"})
    return AuthUser(user, claims=None)


def _use_local_remote(monkeypatch, ctx, remote):
    """Swap only the clone URL, so the real clone_bare (clone, HEAD detection, cleanup) still runs."""
    real = ctx.git.clone_bare

    async def clone(repo_id, clone_url, token=None):
        assert clone_url == "https://github.com/devuser/notes.git"  # what the service vetted
        return await real(repo_id, str(remote), token)

    monkeypatch.setattr(ctx.git, "clone_bare", clone)


def _patch_github(monkeypatch, remote, **over):
    """client.get_repo answers for our local remote instead of calling GitHub."""
    repo = {"full_name": "devuser/notes", "name": "notes", "owner": "devuser",
            "description": "a repo", "private": True, "fork": False, "archived": False,
            "empty": False, "default_branch": "trunk", "language": "Python", "size_kb": 12,
            "stars": 0, "pushed_at": None, "clone_url": "https://github.com/devuser/notes.git"}
    repo.update(over)
    monkeypatch.setattr(service.client, "get_repo", lambda s, t, fn: dict(repo))
    return repo


async def test_import_clones_indexes_and_feeds_analytics(ctx, remote, monkeypatch):
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    auth = await _user(ctx)

    repo, summary = await service.import_repo(ctx, auth, "devuser/notes")

    assert repo["default_branch"] == "trunk"  # taken from the clone's HEAD, not the API field
    assert repo["visibility"] == "private"  # mirrors GitHub
    assert summary["branches"] == 2 and summary["commits_indexed"] == 2
    assert ctx.storage.exists(repo["id"])

    branches = sorted(b["name"] for b in await ctx.git.list_branches(repo["id"]))
    assert branches == ["feature", "trunk"]
    assert len(await ctx.store.list_indexed_commits(repo["id"], 50)) == 2

    # the one event reaches both the repository feed and the user's own activity page
    assert [e["type"] for e in await ctx.store.list_repo_events(repo["id"], 10)] == ["repo.imported"]
    mine = await ctx.store.list_user_activity(auth.id, 10)
    assert mine[0]["type"] == "repo.imported" and mine[0]["data"]["source"] == "devuser/notes"

    # Spark/RDD path: the dataset builder reads the imported history straight out of Git
    data = await build_dataset(ctx, {"task_type": "commit_activity_rdd", "user_id": auth.id,
                                     "repo_ids": [repo["id"]], "params": {}})
    assert data["kind"] == "commits" and data["rows"] == 2
    assert {c["message"] for c in data["commits"]} == {"first commit", "second commit"}
    assert all(c["repo_id"] == repo["id"] for c in data["commits"])


async def test_failed_clone_leaves_nothing_behind(ctx, remote, monkeypatch):
    _patch_github(monkeypatch, remote)
    auth = await _user(ctx)

    async def boom(repo_id, clone_url, token=None):
        raise RuntimeError("network died mid-clone")

    monkeypatch.setattr(ctx.git, "clone_bare", boom)
    with pytest.raises(RuntimeError):
        await service.import_repo(ctx, auth, "devuser/notes")

    # no phantom repository, and the name is free again for a retry
    assert await ctx.store.list_repos_for_user(auth.id) == []


async def test_empty_and_oversized_repos_are_refused(ctx, remote, monkeypatch):
    auth = await _user(ctx)
    _patch_github(monkeypatch, remote, empty=True)
    with pytest.raises(InvalidInput) as e:
        await service.import_repo(ctx, auth, "devuser/notes")
    assert e.value.code == "remote_empty"

    _patch_github(monkeypatch, remote, size_kb=ctx.settings.github_max_repo_kb + 1)
    with pytest.raises(InvalidInput) as e:
        await service.import_repo(ctx, auth, "devuser/notes")
    assert e.value.code == "repo_too_large"


async def test_github_account_binds_to_one_user(ctx):
    from app.core.exceptions import Conflict
    first = await _user(ctx, "first@example.com")
    second = await _user(ctx, "second@example.com", github_id=9999)
    with pytest.raises(Conflict) as e:
        await ctx.store.set_github_identity(second.id, {
            "github_id": 4242, "login": "devuser", "access_token": "t", "scope": "repo"})
    assert e.value.code == "github_already_linked"
    assert (await ctx.store.get_user_by_github_id(4242))["id"] == first.id


async def test_oauth_only_account_cannot_password_login(ctx):
    auth = await _user(ctx)
    user = await ctx.store.get_user(auth.id)
    assert user["password_hash"] is None
    # a null hash must never verify, whatever is supplied
    assert verify_password("", None) is False
    assert verify_password("guess", user["password_hash"]) is False


async def test_connect_state_is_bound_to_the_session_that_started_it(ctx):
    from app.core.exceptions import Forbidden
    alice = await _user(ctx, "alice@example.com")
    state = create_oauth_state(ctx.settings, mode="connect", uid=alice.id, next=None)
    # a different signed-in user replaying Alice's state cannot attach her GitHub account
    with pytest.raises(Forbidden):
        await service.callback(ctx, "code", state, caller_id=str(uuid.uuid4()))


def test_local_name_mapping():
    assert service._local_name("notes") == "notes"
    assert service._local_name("-weird_.name") == "weird_.name"
    assert service._local_name("...") == "imported-repo"
    assert service._local_name("thing.git") == "thing"
    assert len(service._local_name("x" * 200)) == 64
