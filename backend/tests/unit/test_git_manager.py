"""Command construction and subprocess error handling."""
import logging
import subprocess

import pytest

from app.core.exceptions import PayloadTooLarge
from app.integrations.git.manager import GitError, GitManager, GitTimeout, Result
from app.integrations.git.storage import LocalRepositoryStorage
from tests.conftest import make_settings

RID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def gm(tmp_path):
    s = make_settings(tmp_path)
    return GitManager(s, LocalRepositoryStorage(s.git_repos_dir))


def test_argv_list_no_shell_and_scoped_git_dir(gm, monkeypatch):
    seen = {}

    def fake_run(argv, **kw):
        seen.update(argv=argv, **kw)
        return subprocess.CompletedProcess(argv, 0, b"ok", b"")
    monkeypatch.setattr(subprocess, "run", fake_run)
    gm._run_sync(RID, ["log", "--", "; rm -rf /"])
    assert isinstance(seen["argv"], list) and seen["shell"] is False and seen["timeout"] == gm.cfg.git_timeout_s
    assert seen["argv"][1].startswith("--git-dir=") and seen["argv"][1].endswith(f"{RID}.git")
    assert seen["argv"][-1] == "; rm -rf /"  # stays a single inert argument
    assert seen["env"]["GIT_TERMINAL_PROMPT"] == "0" and seen["env"]["GIT_CONFIG_NOSYSTEM"] == "1"
    assert not any(k.startswith(("JWT", "ASTRA", "R2_", "CLOUDINARY", "WORKER")) for k in seen["env"])


def test_timeout_maps_to_sanitised_error(gm, monkeypatch):
    def boom(argv, **kw):
        raise subprocess.TimeoutExpired(argv, 1)
    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(GitTimeout) as e:
        gm._run_sync(RID, ["log"])
    assert e.value.status == 504 and RID not in e.value.message


def test_missing_binary_and_output_cap(gm, monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError("git")))
    with pytest.raises(GitError):
        gm._run_sync(None, ["--version"])
    monkeypatch.setattr(subprocess, "run", lambda a, **k: subprocess.CompletedProcess(a, 0, b"x" * 3_000_000, b""))
    with pytest.raises(PayloadTooLarge):
        gm._run_sync(None, ["log"])


def test_nonzero_exit_is_sanitised_and_logged_without_args(gm, caplog):
    caplog.set_level(logging.WARNING)
    err = gm._fail("cat-file", Result(128, b"", b"fatal: bad object /secret/path/token123"))
    assert "secret" not in err.message and "token123" not in caplog.text


def test_storage_never_escapes_root(tmp_path):
    st = LocalRepositoryStorage(tmp_path / "r")
    for bad in ("../x", "..", "/etc", "not-a-uuid", RID + "/../.."):
        with pytest.raises(Exception):
            st.path_for(bad)
    assert st.path_for(RID).parent == (tmp_path / "r").resolve()
