import time

import jwt
import pytest

from app.core.security import hash_password, verify_password
from tests.conftest import register_and_login

API = "/api/v1"


def test_password_hash_is_argon2id_and_never_returned(client):
    h = hash_password("a-long-password")
    assert h.startswith("$argon2id$") and verify_password("a-long-password", h)
    assert not verify_password("wrong", h) and not verify_password("x", None)
    r = client.post(f"{API}/auth/register", json={"email": "a@example.com", "password": "a-long-password",
                                                  "display_name": "A"})
    assert r.status_code == 201 and "password" not in r.text and "argon2" not in r.text


def test_register_duplicate_email_case_insensitive(client):
    register_and_login(client, "dup@example.com")
    r = client.post(f"{API}/auth/register", json={"email": "DUP@example.com", "password": "another-long-pw",
                                                  "display_name": "B"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


@pytest.mark.parametrize("body", [
    {"email": "bad", "password": "long-enough-pw", "display_name": "x"},
    {"email": "a@example.com", "password": "short", "display_name": "x"},
    {"email": "a@example.com", "password": "long-enough-pw", "display_name": "<script>"},
    {"email": "a@example.com", "password": "long-enough-pw", "display_name": "x", "is_admin": True},
])
def test_register_validation(client, body):
    r = client.post(f"{API}/auth/register", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert "long-enough-pw" not in r.text  # submitted values are never echoed


def test_login_failures_are_uniform(client):
    register_and_login(client, "u@example.com")
    bad_pw = client.post(f"{API}/auth/login", json={"email": "u@example.com", "password": "nope-nope-nope"})
    no_user = client.post(f"{API}/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"})
    assert bad_pw.status_code == no_user.status_code == 401
    assert bad_pw.json()["error"]["message"] == no_user.json()["error"]["message"]


def _tok(settings, **over):
    now = int(time.time())
    p = {"sub": "11111111-1111-1111-1111-111111111111", "iat": now, "exp": now + 60, "jti": "j",
         "iss": settings.jwt_issuer, "aud": settings.jwt_audience}
    p.update(over)
    key = over.pop("_key", settings.jwt_secret.get_secret_value())
    return jwt.encode({k: v for k, v in p.items() if v is not None}, key, algorithm="HS256")


@pytest.mark.parametrize("mut", [
    {"exp": int(time.time()) - 10},          # expired
    {"aud": "other"}, {"iss": "other"},      # wrong audience / issuer
    {"sub": "not-a-uuid"}, {"jti": None},    # malformed / missing claim
])
def test_bad_tokens_rejected(client, settings, mut):
    r = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {_tok(settings, **mut)}"})
    assert r.status_code == 401


def test_other_signature_garbage_and_alg_none_rejected(client, settings):
    forged = jwt.encode({"sub": "11111111-1111-1111-1111-111111111111"}, "x" * 40, algorithm="HS256")
    for t in (forged, "garbage", jwt.encode({"sub": "x"}, None, algorithm="none")):
        assert client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401
    assert client.get(f"{API}/users/me").status_code == 401


def test_valid_token_for_deleted_user_rejected(client, settings):
    assert client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {_tok(settings)}"}).status_code == 401


def test_logout_revokes_token(client, alice):
    _, h = alice
    assert client.post(f"{API}/auth/logout", headers=h).status_code == 204
    assert client.get(f"{API}/users/me", headers=h).status_code == 401


def test_patch_me(client, alice):
    _, h = alice
    r = client.patch(f"{API}/users/me", headers=h, json={"display_name": "Alicia"})
    assert r.json()["display_name"] == "Alicia"
    assert client.patch(f"{API}/users/me", headers=h, json={"email": "x@y.zz"}).status_code == 422
