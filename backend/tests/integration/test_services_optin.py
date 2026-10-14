"""Opt-in checks against real services / native git. Skipped unless RUN_INTEGRATION=1 and credentials exist.

  RUN_INTEGRATION=1 R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... pytest -m integration
"""
import asyncio
import io
import os
import subprocess
import uuid
from pathlib import Path

import pytest

from app.core.config import Settings

pytestmark = [pytest.mark.integration,
              pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1")]
API = "/api/v1"


def test_native_git_bundle_roundtrip(client, alice, tmp_path):
    """Export a real repo as a bundle and prove with real git that it clones back to identical content."""
    from app.integrations.git.manager import GitManager
    from app.integrations.git.storage import LocalRepositoryStorage
    _, h = alice
    rid = client.post(f"{API}/repositories", headers=h, json={"name": "rt"}).json()["id"]
    client.post(f"{API}/repositories/{rid}/commits", headers=h, json={
        "branch": "main", "message": "m", "changes": [{"path": "a/b.txt", "content": "héllo\r\n"}]})
    ctx = client.app.state.ctx
    bundle = tmp_path / "x.bundle"
    asyncio.run(ctx.git.create_bundle(rid, bundle))
    out = tmp_path / "clone"
    subprocess.run(["git", "clone", "-q", str(bundle), str(out)], check=True)
    assert (out / "a" / "b.txt").read_bytes() == "héllo\r\n".encode()
    assert subprocess.run(["git", "-C", str(out), "fsck", "--strict"], capture_output=True).returncode == 0


@pytest.mark.skipif(not os.getenv("R2_BUCKET_NAME"), reason="R2 credentials not set")
async def test_r2_roundtrip():
    from app.integrations.r2.client import R2Client
    r2 = R2Client(Settings(_env_file=None, database_backend="memory"))
    key = f"it-tests/{uuid.uuid4().hex}"
    sha = await r2.upload_bytes(key, b"payload", "text/plain")
    try:
        assert await r2.download(key) == b"payload" and len(sha) == 64
        assert "X-Amz-Signature" in r2.presign_get(key, 60)
    finally:
        await r2.delete(key)


@pytest.mark.skipif(not os.getenv("CLOUDINARY_CLOUD_NAME"), reason="Cloudinary credentials not set")
async def test_cloudinary_avatar_roundtrip():
    from PIL import Image
    from app.integrations.cloudinary.client import CloudinaryClient
    s = Settings(_env_file=None, database_backend="memory")
    cc = CloudinaryClient(s)
    b = io.BytesIO()
    Image.new("RGB", (32, 32), "blue").save(b, "PNG")
    uid = f"it-{uuid.uuid4().hex[:8]}"
    url, pid = await cc.upload_avatar(uid, b.getvalue(), "PNG")
    try:
        assert url.startswith("https://") and pid == f"gitarchey/avatars/{uid}"
    finally:
        await cc.delete_avatar(pid)
