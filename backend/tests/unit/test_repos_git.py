"""Real native git, real temp directories, in-memory DB."""
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.integrations.git.storage import LocalRepositoryStorage
from tests.conftest import requires_git

API = "/api/v1"
pytestmark = requires_git


def mk_repo(c, h, name="demo", **kw):
    r = c.post(f"{API}/repositories", headers=h, json={"name": name, **kw})
    assert r.status_code == 201, r.text
    return r.json()


def commit(c, h, rid, path, content, branch="main", msg="edit", **kw):
    return c.post(f"{API}/repositories/{rid}/commits", headers=h,
                  json={"branch": branch, "message": msg, "changes": [{"path": path, "content": content}], **kw})


def test_full_flow(client, alice, settings):
    _, h = alice
    repo = mk_repo(client, h, description="hello")
    rid = repo["id"]
    assert (Path(settings.git_repos_dir) / f"{rid}.git").is_dir()  # server-generated uuid path

    # content is preserved byte for byte (no stripping / newline rewriting)
    code = "def f():\r\n    return '<b>&\"</b>'  \n\t# ünïcode ✓\n\n\n"
    r = commit(client, h, rid, "src/app.py", code, msg="add app\n\nbody")
    assert r.status_code == 201, r.text
    sha = r.json()["sha"]

    f = client.get(f"{API}/repositories/{rid}/files", headers=h, params={"path": "src/app.py"}).json()
    assert f["content"] == code and f["encoding"] == "utf-8" and f["commit"] == sha

    tree = client.get(f"{API}/repositories/{rid}/tree", headers=h).json()
    assert {e["name"]: e["type"] for e in tree["entries"]} == {"README.md": "file", "src": "dir"}
    sub = client.get(f"{API}/repositories/{rid}/tree", headers=h, params={"path": "src"}).json()
    assert sub["entries"][0]["name"] == "app.py"

    # branch + edit on branch + diff + history
    assert client.post(f"{API}/repositories/{rid}/branches", headers=h, json={"name": "feature/x"}).status_code == 201
    assert client.post(f"{API}/repositories/{rid}/branches", headers=h, json={"name": "feature/x"}).status_code == 409
    assert commit(client, h, rid, "src/app.py", "print(1)\n", branch="feature/x", msg="change").status_code == 201
    names = {b["name"]: b for b in client.get(f"{API}/repositories/{rid}/branches", headers=h).json()}
    assert set(names) == {"main", "feature/x"} and names["main"]["is_default"]

    d = client.get(f"{API}/repositories/{rid}/diff", headers=h, params={"base": "main", "head": "feature/x"}).json()
    assert d["files"][0]["path"] == "src/app.py" and "+print(1)" in d["patch"] and not d["truncated"]

    log = client.get(f"{API}/repositories/{rid}/commits", headers=h, params={"ref": "feature/x"}).json()
    assert [c["message"] for c in log] == ["change", "add app", "Initial commit"]
    assert log[0]["author_name"] == "Alice" and log[0]["author_email"].endswith("@users.noreply.gitarchey.local")

    # delete a file; nothing-to-commit; missing branch
    r = client.post(f"{API}/repositories/{rid}/commits", headers=h, json={
        "branch": "main", "message": "rm", "changes": [{"path": "src/app.py", "delete": True}]})
    assert r.status_code == 201
    assert commit(client, h, rid, "README.md", "# demo\n\nhello\n").json()["error"]["code"] == "nothing_to_commit"
    assert commit(client, h, rid, "a.txt", "x", branch="nope").status_code == 404

    kinds = [e["type"] for e in client.get(f"{API}/repositories/{rid}/activity", headers=h).json()]
    assert kinds[0] == "commit.created" and "repo.created" in kinds and "branch.created" in kinds


def test_binary_base64_stale_parent_path_conflict(client, alice):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    r = client.post(f"{API}/repositories/{rid}/commits", headers=h, json={
        "branch": "main", "message": "bin", "changes": [{"path": "b.bin", "content": "AAEC/w==", "encoding": "base64"}]})
    assert r.status_code == 201
    f = client.get(f"{API}/repositories/{rid}/files", headers=h, params={"path": "b.bin"}).json()
    assert f["encoding"] == "base64" and f["content"] == "AAEC/w=="
    assert commit(client, h, rid, "x.txt", "1", expected_parent="0" * 40).json()["error"]["code"] == "stale_parent"
    assert commit(client, h, rid, "b.bin/inner", "1").json()["error"]["code"] == "path_conflict"


@pytest.mark.parametrize("bad", ["../../etc/passwd", "/abs", "a/../b", ".git/hooks/pre-commit", "a\\b"])
def test_path_traversal_rejected_everywhere(client, alice, bad):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    assert commit(client, h, rid, bad, "x").status_code == 422
    assert client.get(f"{API}/repositories/{rid}/files", headers=h, params={"path": bad}).status_code == 422
    assert client.get(f"{API}/repositories/{rid}/tree", headers=h, params={"path": bad}).status_code == 422


@pytest.mark.parametrize("ref", ["--output=/tmp/pwn", "main^", "HEAD~1", "a:b", "-x"])
def test_option_and_revision_injection_rejected(client, alice, ref):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    assert client.get(f"{API}/repositories/{rid}/commits", headers=h, params={"ref": ref}).status_code == 422
    assert client.get(f"{API}/repositories/{rid}/diff", headers=h,
                      params={"base": ref, "head": "main"}).status_code == 422
    assert client.post(f"{API}/repositories/{rid}/branches", headers=h, json={"name": ref}).status_code == 422


def test_unknown_ref_404_and_error_has_no_internal_details(client, alice, settings):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    r = client.get(f"{API}/repositories/{rid}/commits", headers=h, params={"ref": "ghost"})
    assert r.status_code == 404
    assert settings.git_repos_dir not in r.text and "Traceback" not in r.text


def test_symlink_entries_are_never_followed(client, alice, settings):
    """A symlink committed straight into the repo is returned as a link, not resolved to a host file."""
    _, h = alice
    rid = mk_repo(client, h)["id"]
    gd = str(Path(settings.git_repos_dir) / f"{rid}.git")
    blob = subprocess.run(["git", f"--git-dir={gd}", "hash-object", "-w", "--stdin"], input=b"/etc/passwd",
                          capture_output=True, check=True).stdout.decode().strip()
    idx = Path(settings.git_repos_dir) / "tmp.index"
    env = {**os.environ, "GIT_INDEX_FILE": str(idx), "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}

    def g(*a):
        return subprocess.run(["git", f"--git-dir={gd}", *a], env=env, capture_output=True, check=True)
    g("read-tree", "main")
    g("update-index", "--add", "--cacheinfo", f"120000,{blob},link")
    tree = g("write-tree").stdout.decode().strip()
    new = g("commit-tree", tree, "-p", "main", "-m", "link").stdout.decode().strip()
    g("update-ref", "refs/heads/main", new)
    f = client.get(f"{API}/repositories/{rid}/files", headers=h, params={"path": "link"}).json()
    assert f["is_symlink"] and f["content"] == "/etc/passwd" and f["size"] == 11  # target text only


def test_concurrent_commits_are_serialised(client, alice):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda i: commit(client, h, rid, f"f{i}.txt", str(i), msg=f"c{i}"), range(8)))
    assert [r.status_code for r in res] == [201] * 8
    log = client.get(f"{API}/repositories/{rid}/commits", headers=h, params={"limit": 50}).json()
    assert len(log) == 9  # linear history, nothing lost
    tree = client.get(f"{API}/repositories/{rid}/tree", headers=h).json()
    assert len(tree["entries"]) == 9


def test_duplicate_repo_name_per_owner(client, alice, bob):
    _, h = alice
    mk_repo(client, h, "same")
    r = client.post(f"{API}/repositories", headers=h, json={"name": "SAME"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "repo_name_taken"
    mk_repo(client, bob[1], "same")  # names are per owner


def test_delete_removes_storage_and_metadata(client, alice, settings):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    assert client.delete(f"{API}/repositories/{rid}", headers=h).status_code == 204
    assert not (Path(settings.git_repos_dir) / f"{rid}.git").exists()
    assert client.get(f"{API}/repositories/{rid}", headers=h).status_code == 404
    assert client.get(f"{API}/repositories", headers=h).json() == []
    mk_repo(client, h)  # name is free again


def test_missing_storage_reports_503_not_500(client, alice, settings):
    _, h = alice
    rid = mk_repo(client, h)["id"]
    LocalRepositoryStorage(settings.git_repos_dir).remove(rid)  # e.g. ephemeral disk wiped
    r = client.get(f"{API}/repositories/{rid}/tree", headers=h)
    assert r.status_code == 503 and r.json()["error"]["code"] == "repo_storage_unavailable"
    assert client.get(f"{API}/repositories/{rid}", headers=h).status_code == 200  # metadata still served


def test_search_finds_matches_and_respects_access(client, alice, bob):
    _, h = alice
    _, hb = bob
    rid = mk_repo(client, h, name="searchable", visibility="private")["id"]
    assert commit(client, h, rid, "src/app.py", "def handler():\n    return TOKEN_value\n").status_code == 201
    assert commit(client, h, rid, "docs/notes.md", "nothing here\n").status_code == 201

    r = client.get(f"{API}/repositories/{rid}/search", headers=h, params={"q": "token_value"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [(x["path"], x["line"], x["text"]) for x in body["hits"]] == [("src/app.py", 2, "    return TOKEN_value")]
    assert not body["truncated"] and body["query"] == "token_value"

    # no match is an answer, not an error; and the path filter narrows it
    assert client.get(f"{API}/repositories/{rid}/search", headers=h, params={"q": "zzznope"}).json()["hits"] == []
    assert client.get(f"{API}/repositories/{rid}/search", headers=h,
                      params={"q": "nothing", "path": "src"}).json()["hits"] == []

    # a regex metacharacter is a literal, not a pattern
    assert client.get(f"{API}/repositories/{rid}/search", headers=h, params={"q": ".*"}).json()["hits"] == []

    # too short, and a non-member sees the private repo as absent
    assert client.get(f"{API}/repositories/{rid}/search", headers=h, params={"q": "x"}).status_code == 422
    assert client.get(f"{API}/repositories/{rid}/search", headers=hb, params={"q": "token"}).status_code == 404
