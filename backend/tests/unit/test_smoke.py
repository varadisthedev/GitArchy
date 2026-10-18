from tests.conftest import register_and_login


def test_health_ready(client):
    assert client.get("/health").json() == {"status": "ok"}
    r = client.get("/ready")
    assert r.status_code == 200 and r.json()["checks"] == {"database": "memory", "git": "ok"}
    assert r.json()["optional"]["r2"] == "off"   # no credentials in the test settings


def test_register_login_me(client):
    uid, h = register_and_login(client)
    me = client.get("/api/v1/users/me", headers=h).json()
    assert me["id"] == uid and "password" not in str(me)
