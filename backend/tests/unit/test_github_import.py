"""GitHub import, end to end, with GitHub itself replaced by a local Git remote.

What this pins down (the parts that break silently):
- a clone lands as a real repository: branches indexed, commits indexed, default branch from HEAD
- the import writes one activity event, so both /activity and the repo's activity page show it
- the Spark dataset builder can read the imported history (analytics works on imported repos)
- a failed clone leaves no phantom repository and no blocked name
- the GitHub account -> user binding is exclusive, and OAuth-only accounts cannot password-login
"""
import json
import subprocess
import uuid

import pytest

from app.api.dependencies import AuthUser, Context
from app.core.exceptions import Conflict
from app.core.security import create_oauth_state, verify_password
from app.integrations.astra.memory import MemoryStore, utcnow
from app.integrations.git.manager import GitManager
from app.integrations.git.storage import LocalRepositoryStorage
from app.core.rate_limit import Limiter
from app.modules.analytics import datasets
from app.modules.analytics.datasets import DatasetError, build_dataset
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
    settings = make_settings(tmp_path, github_oauth_client_id="cid", github_oauth_client_secret="csecret",
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

    # the language breakdown reads the tree instead: files that exist now, with their blob sizes
    tree = await build_dataset(ctx, {"task_type": "language_breakdown", "user_id": auth.id,
                                     "repo_ids": [repo["id"]], "params": {}})
    assert tree["kind"] == "files" and tree["rows"] == len(tree["files"])
    assert {f["path"] for f in tree["files"]} == {"a.py", "b.md"}
    assert all(f["size"] > 0 and f["repo_id"] == repo["id"] for f in tree["files"])


async def test_restore_reclones_a_repository_whose_disk_was_wiped(ctx, remote, monkeypatch):
    """The whole point of recording `source`: an ephemeral host loses the clone, not the repository."""
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    auth = await _user(ctx)
    repo, _ = await service.import_repo(ctx, auth, "devuser/notes")

    ctx.git.delete_repo(repo["id"])          # what a restart does to Render's disk
    assert not ctx.storage.exists(repo["id"])

    restored, summary = await service.restore_repo(ctx, auth, repo["id"])

    assert ctx.storage.exists(repo["id"]) and restored["id"] == repo["id"]
    assert summary["branches"] == 2 and summary["commits_indexed"] == 2
    assert len(await ctx.git.analytics_log(repo["id"], restored["default_branch"], 50)) == 2
    assert [e["type"] for e in await ctx.store.list_repo_events(repo["id"], 10)] == [
        "repo.restored", "repo.imported"]

    with pytest.raises(Conflict):            # storage is present now: restore must not re-clone over it
        await service.restore_repo(ctx, auth, repo["id"])


async def test_restore_applies_the_same_size_limit_as_import(ctx, remote, monkeypatch):
    """A repository can grow past the limit after it was imported; restore must not clone it anyway."""
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    auth = await _user(ctx)
    repo, _ = await service.import_repo(ctx, auth, "devuser/notes")
    ctx.git.delete_repo(repo["id"])

    _patch_github(monkeypatch, remote, size_kb=ctx.settings.github_max_repo_kb + 1)
    with pytest.raises(InvalidInput):
        await service.restore_repo(ctx, auth, repo["id"])
    assert not ctx.storage.exists(repo["id"])   # refused before git was handed anything


async def test_restore_stays_retryable_when_indexing_fails(ctx, remote, monkeypatch):
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    auth = await _user(ctx)
    repo, _ = await service.import_repo(ctx, auth, "devuser/notes")
    ctx.git.delete_repo(repo["id"])

    async def boom(*a, **kw):
        raise RuntimeError("cassandra is down")

    monkeypatch.setattr(ctx.store, "index_branch", boom)
    with pytest.raises(RuntimeError):
        await service.restore_repo(ctx, auth, repo["id"])
    # the clone is gone, so the next attempt is a clean restore rather than Conflict(storage_present)
    assert not ctx.storage.exists(repo["id"])
    monkeypatch.undo()
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    await service.restore_repo(ctx, auth, repo["id"])
    assert ctx.storage.exists(repo["id"])


async def test_restore_refuses_a_repository_that_was_never_imported(ctx, monkeypatch):
    auth = await _user(ctx)
    repo = {"id": str(uuid.uuid4()), "owner_id": auth.id, "name": "handmade", "description": "",
            "visibility": "private", "default_branch": "main", "created_at": utcnow(),
            "updated_at": utcnow()}
    await ctx.store.create_repo(repo)
    with pytest.raises(InvalidInput):
        await service.restore_repo(ctx, auth, repo["id"])


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
    started = service.start(ctx, "connect", None, alice.id)
    # a different signed-in user replaying Alice's state cannot attach her GitHub account
    with pytest.raises(Forbidden):
        await service.callback(ctx, "code", started["state"], started["nonce"],
                               caller_id=str(uuid.uuid4()))


async def test_state_must_come_from_the_browser_that_started_it(ctx):
    """Login CSRF: a signed state alone must not be enough to drive someone else's browser."""
    from app.core.exceptions import Unauthorized
    started = service.start(ctx, "signin", None, None)
    other = service.start(ctx, "signin", None, None)
    # the attacker's state paired with this browser's nonce (or none at all) is refused
    for bad_nonce in ("", "guessed", other["nonce"]):
        with pytest.raises(Unauthorized) as e:
            await service.callback(ctx, "code", started["state"], bad_nonce, caller_id=None)
        assert e.value.code == "oauth_state_invalid"
    # a state with no nonce hash at all (an older or hand-rolled one) is refused too
    legacy = create_oauth_state(ctx.settings, mode="signin", uid=None, next=None)
    with pytest.raises(Unauthorized):
        await service.callback(ctx, "code", legacy, "anything", caller_id=None)


async def test_state_is_single_use(ctx, monkeypatch):
    """A replayed state must fail even while its signature is still inside the expiry window."""
    monkeypatch.setattr(service.client, "exchange_code",
                        lambda s, c: {"access_token": "gho_x", "scope": "repo"})
    monkeypatch.setattr(service.client, "get_viewer", lambda s, t: {
        "github_id": 777, "login": "newbie", "name": "New Bie", "avatar_url": None, "email": None})
    monkeypatch.setattr(service.client, "get_verified_email", lambda s, t: None)
    started = service.start(ctx, "signin", None, None)
    first = await service.callback(ctx, "code", started["state"], started["nonce"], caller_id=None)
    assert first["mode"] == "signin" and first["token"].access_token

    from app.core.exceptions import Unauthorized
    with pytest.raises(Unauthorized) as e:
        await service.callback(ctx, "code", started["state"], started["nonce"], caller_id=None)
    assert e.value.code == "oauth_state_invalid"


async def test_github_signin_never_adopts_an_existing_email_account(ctx, monkeypatch):
    """Pre-hijack: Gitarchey never verifies registration emails, so a matching address must not
    hand the GitHub user someone else's account."""
    from app.core.exceptions import Conflict
    from app.core.security import hash_password
    victim_email = "victim@example.com"
    attacker = {"id": str(uuid.uuid4()), "email": victim_email, "display_name": "Squatter",
                "password_hash": hash_password("attacker-knows-this"), "avatar_url": None,
                "avatar_public_id": None, "created_at": utcnow()}
    await ctx.store.create_user(attacker)

    monkeypatch.setattr(service.client, "exchange_code",
                        lambda s, c: {"access_token": "gho_x", "scope": "repo"})
    monkeypatch.setattr(service.client, "get_viewer", lambda s, t: {
        "github_id": 555, "login": "victim", "name": "Victim", "avatar_url": None,
        "email": victim_email})
    monkeypatch.setattr(service.client, "get_verified_email", lambda s, t: victim_email)

    started = service.start(ctx, "signin", None, None)
    with pytest.raises(Conflict) as e:
        await service.callback(ctx, "code", started["state"], started["nonce"], caller_id=None)
    assert e.value.code == "github_email_taken"
    # and no session was handed out for the squatted account
    assert await ctx.store.get_user_by_github_id(555) is None


async def test_switching_github_accounts_releases_the_old_claim(ctx):
    """A stale claim would keep signing in as this user and block anyone else from linking it."""
    user = await _user(ctx, "switcher@example.com", github_id=1001)
    assert (await ctx.store.get_user_by_github_id(1001))["id"] == user.id

    await ctx.store.set_github_identity(user.id, {
        "github_id": 2002, "login": "newlogin", "access_token": "gho_2", "scope": "repo"})
    assert (await ctx.store.get_user_by_github_id(2002))["id"] == user.id
    assert await ctx.store.get_user_by_github_id(1001) is None  # old claim released

    # the freed account can now be linked by somebody else
    other = await _user(ctx, "other@example.com", github_id=3003)
    await ctx.store.set_github_identity(other.id, {
        "github_id": 1001, "login": "oldlogin", "access_token": "gho_3", "scope": "repo"})
    assert (await ctx.store.get_user_by_github_id(1001))["id"] == other.id


def test_local_name_mapping():
    assert service._local_name("notes") == "notes"
    assert service._local_name("-weird_.name") == "weird_.name"
    assert service._local_name("...") == "imported-repo"
    assert service._local_name("thing.git") == "thing"
    assert len(service._local_name("x" * 200)) == 64


async def test_the_survey_leaves_private_repositories_out_until_there_is_a_crowd(ctx, remote, monkeypatch):
    """One connected account must not be able to subtract itself and read the remainder.

    The repository here is private, so a truthful "private: 1" would tell any other signed-in reader
    that a private repository exists - and its languages and commit style with it. Below the floor
    the survey covers public repositories only, and with none there is nothing to survey.
    """
    _patch_github(monkeypatch, remote)
    _use_local_remote(monkeypatch, ctx, remote)
    auth = await _user(ctx)
    repo, _ = await service.import_repo(ctx, auth, "devuser/notes")
    assert repo["visibility"] == "private"
    job = {"task_type": "platform_survey", "user_id": auth.id, "repo_ids": [], "params": {}}

    with pytest.raises(DatasetError):
        await build_dataset(ctx, job)

    monkeypatch.setattr(datasets, "SURVEY_MIN_ACCOUNTS", 1)
    data = await build_dataset(ctx, job)
    assert data["kind"] == "survey" and data["accounts"] == 1
    assert [r["visibility"] for r in data["repos"]] == ["private"]
    # nothing identifying rides along even before the worker aggregates it
    assert all(set(r) == {"visibility"} for r in data["repos"])
    assert "devuser" not in json.dumps(data) and repo["id"] not in json.dumps(data)


async def test_the_survey_shares_its_cap_between_accounts(ctx, monkeypatch):
    """The floor counts accounts that actually reached the dataset, so the cap must not starve them.

    Taking repositories account by account would let one hoarder fill the cap alone, leaving a
    "survey of five accounts" that is really a survey of one - the floor passing while the crowd it
    assumes is absent.
    """
    monkeypatch.setattr(datasets, "SURVEY_MAX_REPOS", 4)
    hoarder = await _user(ctx, email="hoarder@example.com", github_id=1)
    quiet = await _user(ctx, email="quiet@example.com", github_id=2)
    for owner, n in ((hoarder, 6), (quiet, 2)):
        for i in range(n):
            await ctx.store.create_repo({"id": str(uuid.uuid4()), "owner_id": owner.id,
                                         "name": f"r{i}", "visibility": "public", "description": None,
                                         "default_branch": "main", "source": None, "created_at": utcnow(),
                                         "updated_at": utcnow()})
    job = {"task_type": "platform_survey", "user_id": hoarder.id, "repo_ids": [], "params": {}}

    data = await build_dataset(ctx, job)   # git has no data for these; only the repository rows count

    assert data["accounts"] == 2 and len(data["repos"]) == 4   # 2 from each, not 4 from the hoarder
