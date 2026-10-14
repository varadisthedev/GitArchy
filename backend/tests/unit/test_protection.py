"""Body limits, rate limiting, error envelope, headers, redaction, config validation."""
import json
import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import JsonFormatter, redact
from app.main import create_app
from tests.conftest import make_settings, register_and_login

API = "/api/v1"


def test_json_body_limit_413(tmp_path):
    with TestClient(create_app(make_settings(tmp_path, max_request_body_bytes=1000))) as c:
        r = c.post(f"{API}/auth/register", content=b"x" * 2000, headers={"content-type": "application/json"})
        assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


def test_oversize_file_content_rejected(client, alice):
    _, h = alice
    rid = client.post(f"{API}/repositories", headers=h, json={"name": "big"}).json()["id"]
    r = client.post(f"{API}/repositories/{rid}/commits", headers=h, json={
        "branch": "main", "message": "m", "changes": [{"path": "big.txt", "content": "x" * 1_200_000}]})
    assert r.status_code in (413, 422)


def test_rate_limit_login_and_register(tmp_path):
    s = make_settings(tmp_path, rate_limit_enabled=True, rl_login="3/minute", rl_register="2/minute")
    with TestClient(create_app(s)) as c:
        codes = [c.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "x"}).status_code
                 for _ in range(5)]
        assert codes[:3] == [401] * 3 and codes[3:] == [429, 429]
        assert c.post(f"{API}/auth/login", json={"email": "a@example.com", "password": "x"}).json()["error"]["code"] == "rate_limited"
        reg = [c.post(f"{API}/auth/register", json={"email": f"u{i}@example.com", "password": "long-enough-pw",
                                                    "display_name": "u"}).status_code for i in range(3)]
        assert reg == [201, 201, 429]


def test_rate_limit_is_per_user_for_commits(tmp_path):
    s = make_settings(tmp_path, rate_limit_enabled=True, rl_commit="2/minute", rl_register="50/minute",
                      rl_login="50/minute")
    with TestClient(create_app(s)) as c:
        _, ha = register_and_login(c)
        _, hb = register_and_login(c, "bob@example.com", "Bob")
        ra = c.post(f"{API}/repositories", headers=ha, json={"name": "a"}).json()["id"]
        rb = c.post(f"{API}/repositories", headers=hb, json={"name": "a"}).json()["id"]

        def go(h, rid, i):
            return c.post(f"{API}/repositories/{rid}/commits", headers=h, json={
                "branch": "main", "message": "m", "changes": [{"path": f"{i}.txt", "content": "x"}]}).status_code
        assert [go(ha, ra, i) for i in range(3)] == [201, 201, 429]
        assert go(hb, rb, 0) == 201   # bob's bucket is independent


def test_proxy_header_only_trusted_when_enabled(tmp_path):
    from app.core.rate_limit import Limiter

    class Conn:
        headers = {"x-forwarded-for": "9.9.9.9, 1.1.1.1"}
        client = type("C", (), {"host": "10.0.0.1"})()
    assert Limiter(make_settings(tmp_path)).client_ip(Conn) == "10.0.0.1"
    assert Limiter(make_settings(tmp_path, trust_proxy_headers=True)).client_ip(Conn) == "9.9.9.9"


def test_public_errors_hide_internals(settings, monkeypatch):
    with TestClient(create_app(settings), raise_server_exceptions=False) as client:
        _, h = register_and_login(client)

        async def boom(*a, **k):
            raise RuntimeError("secret-dsn://user:hunter2@db /home/varad/x.py")
        monkeypatch.setattr(client.app.state.ctx.store, "list_repos_for_user", boom)
        r = client.get(f"{API}/repositories", headers=h)
        assert r.status_code == 500
        assert r.json()["error"]["code"] == "internal_error" and "hunter2" not in r.text and "varad" not in r.text
        assert r.json()["error"]["request_id"] == r.headers["x-request-id"]


def test_security_headers_and_hosts(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert client.get("/health", headers={"host": "evil.example"}).status_code == 400


def test_cors_allows_only_configured_origins(tmp_path):
    with TestClient(create_app(make_settings(tmp_path, allowed_origins=["https://app.example.com"]))) as c:
        ok = c.options("/health", headers={"origin": "https://app.example.com", "access-control-request-method": "GET"})
        bad = c.options("/health", headers={"origin": "https://evil.example", "access-control-request-method": "GET"})
        assert ok.headers.get("access-control-allow-origin") == "https://app.example.com"
        assert "access-control-allow-origin" not in bad.headers


def test_logs_redact_secrets(capsys):
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eHh4eHh4In0.abcdefghijk"
    rec = logging.LogRecord("t", logging.INFO, "", 0, "auth header Bearer %s ok", (jwt,), None)
    rec.password, rec.worker_token, rec.file_content, rec.nested = "pw", "wt", "SOURCE", {"api_secret": "s", "ok": 1}
    out = json.loads(JsonFormatter().format(rec))
    blob = json.dumps(out)
    for leaked in (jwt, "pw\"", "\"wt\"", "SOURCE", "\"s\""):
        assert leaked not in blob
    assert out["nested"] == {"api_secret": "[REDACTED]", "ok": 1}
    assert redact("AstraCS:abc:def123") == "[REDACTED_ASTRA]"


def test_request_log_has_required_fields(client, alice, caplog):
    caplog.set_level(logging.INFO, logger="gitarchey.access")
    caplog.clear()
    client.get(f"{API}/users/me", headers=alice[1])
    rec = json.loads(JsonFormatter().format([r for r in caplog.records if r.name == "gitarchey.access"][-1]))
    assert rec["path"] == f"{API}/users/me" and rec["method"] == "GET" and rec["status"] == 200
    assert rec["user_id"] == alice[0] and rec["request_id"] and "duration_ms" in rec
    assert alice[1]["Authorization"].split()[1] not in json.dumps(rec)


# ---- configuration ----
def test_production_refuses_memory_db_weak_secret_wildcards(tmp_path):
    base = dict(_env_file=None, app_env="production", database_backend="astra", astra_secure_bundle_path="x.zip",
                astra_application_token="AstraCS:t", astra_keyspace="k", jwt_secret="j" * 40,
                allowed_origins=["https://a.example"], allowed_hosts=["api.example"])
    Settings(**base)  # valid baseline
    for over in ({"database_backend": "memory"}, {"jwt_secret": "short"}, {"allowed_origins": ["*"]},
                 {"allowed_hosts": ["*"]}, {"worker_token": "short"}):
        with pytest.raises(ValidationError):
            Settings(**{**base, **over})


def test_astra_backend_requires_credentials_and_fails_startup(tmp_path):
    with pytest.raises(ValidationError, match="ASTRA_SECURE_BUNDLE_PATH"):
        Settings(_env_file=None, database_backend="astra")
    # configured but unreachable => the app does NOT silently fall back to memory
    s = Settings(_env_file=None, app_env="test", database_backend="astra", astra_secure_bundle_path=str(tmp_path / "nope.zip"),
                 astra_application_token="AstraCS:t", astra_keyspace="k", git_repos_dir=str(tmp_path / "r"))
    with pytest.raises(Exception):
        with TestClient(create_app(s)):
            pass
