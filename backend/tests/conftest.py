import shutil

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

WORKER_TOKEN = "w" * 40


def make_settings(tmp_path, **kw) -> Settings:
    base = dict(_env_file=None, app_env="test", database_backend="memory", git_repos_dir=str(tmp_path / "repos"),
                jwt_secret="j" * 48, worker_token=WORKER_TOKEN, rate_limit_enabled=False,
                allowed_hosts=["testserver"], analytics_max_attempts=2)
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def register_and_login(c, email="alice@example.com", name="Alice", pw="correct-horse-battery"):
    r = c.post("/api/v1/auth/register", json={"email": email, "password": pw, "display_name": name})
    assert r.status_code == 201, r.text
    r = c.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    return d["user"]["id"], {"Authorization": f"Bearer {d['access_token']}"}


@pytest.fixture
def alice(client):
    return register_and_login(client)


@pytest.fixture
def bob(client):
    return register_and_login(client, "bob@example.com", "Bob")


requires_git = pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")
