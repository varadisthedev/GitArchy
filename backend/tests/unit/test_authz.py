"""Repository ownership / collaborator authorization."""
from tests.conftest import register_and_login, requires_git

API = "/api/v1"
pytestmark = requires_git


def mk(c, h, name="r", **kw):
    r = c.post(f"{API}/repositories", headers=h, json={"name": name, **kw})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def commit(c, h, rid, branch="main"):
    return c.post(f"{API}/repositories/{rid}/commits", headers=h, json={
        "branch": branch, "message": "m", "changes": [{"path": "f.txt", "content": str(id(h))}]})


def invite(c, h, rid, email, role):
    return c.put(f"{API}/repositories/{rid}/members", headers=h, json={"email": email, "role": role})


def test_private_repo_invisible_to_strangers_on_every_route(client, alice, bob):
    _, ha = alice
    _, hb = bob
    rid = mk(client, ha)
    routes = [("get", f"/repositories/{rid}"), ("get", f"/repositories/{rid}/branches"),
              ("get", f"/repositories/{rid}/tree"), ("get", f"/repositories/{rid}/files?path=README.md"),
              ("get", f"/repositories/{rid}/commits"), ("get", f"/repositories/{rid}/diff?base=main&head=main"),
              ("get", f"/repositories/{rid}/activity"), ("get", f"/repositories/{rid}/members"),
              ("patch", f"/repositories/{rid}"), ("delete", f"/repositories/{rid}")]
    for m, path in routes:
        r = getattr(client, m)(API + path, headers=hb, **({"json": {}} if m == "patch" else {}))
        assert r.status_code == 404, (m, path, r.status_code)  # 404, not 403: existence is not leaked
    assert client.post(f"{API}/repositories/{rid}/branches", headers=hb, json={"name": "x"}).status_code == 404
    assert commit(client, hb, rid).status_code == 404
    assert client.get(f"{API}/repositories", headers=hb).json() == []
    assert client.get(f"{API}/repositories/{rid}").status_code == 401  # anonymous


def test_unauthenticated_everywhere(client, alice):
    rid = mk(client, alice[1])
    for path in ("/repositories", f"/repositories/{rid}/tree", "/analytics/jobs", "/users/me"):
        assert client.get(API + path).status_code == 401
    assert client.post(f"{API}/repositories", json={"name": "x"}).status_code == 401


def test_public_repo_readable_not_writable(client, alice, bob):
    _, ha = alice
    _, hb = bob
    rid = mk(client, ha, visibility="public")
    assert client.get(f"{API}/repositories/{rid}/tree", headers=hb).status_code == 200
    assert client.post(f"{API}/repositories/{rid}/branches", headers=hb, json={"name": "x"}).status_code == 403
    assert commit(client, hb, rid).status_code == 403
    assert client.patch(f"{API}/repositories/{rid}", headers=hb, json={"description": "x"}).status_code == 403
    assert client.delete(f"{API}/repositories/{rid}", headers=hb).status_code == 403


def test_collaborator_roles(client, alice, bob):
    _, ha = alice
    uid_b, hb = bob
    rid = mk(client, ha)
    assert invite(client, ha, rid, "bob@example.com", "reader").status_code == 200
    assert client.get(f"{API}/repositories/{rid}/tree", headers=hb).status_code == 200
    assert commit(client, hb, rid).status_code == 403          # reader cannot write
    assert invite(client, hb, rid, "alice@example.com", "reader").status_code == 403
    assert [r["id"] for r in client.get(f"{API}/repositories", headers=hb).json()] == [rid]

    invite(client, ha, rid, "bob@example.com", "writer")
    assert commit(client, hb, rid).status_code == 201           # writer can
    assert client.patch(f"{API}/repositories/{rid}", headers=hb, json={"description": "x"}).status_code == 403
    assert client.delete(f"{API}/repositories/{rid}", headers=hb).status_code == 403

    invite(client, ha, rid, "bob@example.com", "admin")
    assert client.patch(f"{API}/repositories/{rid}", headers=hb, json={"description": "x"}).status_code == 200
    assert client.patch(f"{API}/repositories/{rid}", headers=hb, json={"visibility": "public"}).status_code == 403
    assert client.delete(f"{API}/repositories/{rid}", headers=hb).status_code == 403   # owner only

    assert client.delete(f"{API}/repositories/{rid}/members/{uid_b}", headers=ha).status_code == 204
    assert client.get(f"{API}/repositories/{rid}", headers=hb).status_code == 404       # access gone immediately
    assert client.delete(f"{API}/repositories/{rid}", headers=ha).status_code == 204


def test_admin_cannot_escalate_or_touch_owner(client, alice, bob):
    uid_a, ha = alice
    _, hb = bob
    rid = mk(client, ha)
    invite(client, ha, rid, "bob@example.com", "admin")
    assert invite(client, hb, rid, "alice@example.com", "reader").status_code == 403   # owner untouchable
    register_and_login(client, "carol@example.com", "Carol")
    assert invite(client, hb, rid, "carol@example.com", "admin").status_code == 403    # only owner grants admin
    assert invite(client, hb, rid, "carol@example.com", "writer").status_code == 200
    assert client.delete(f"{API}/repositories/{rid}/members/{uid_a}", headers=hb).status_code == 403


def test_repo_id_is_not_a_capability(client, alice, bob):
    """Bob guessing/knowing the id of alice's private repo gets nothing, even via analytics."""
    rid = mk(client, alice[1])
    assert client.post(f"{API}/analytics/jobs", headers=bob[1],
                       json={"task_type": "commit_activity_rdd", "repo_ids": [rid]}).status_code in (404, 503)
    assert client.get(f"{API}/repositories/not-a-uuid", headers=bob[1]).status_code == 422
