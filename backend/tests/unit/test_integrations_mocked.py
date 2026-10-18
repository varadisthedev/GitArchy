"""R2 and Cloudinary through mocked clients - no credentials or network."""
import asyncio
import io
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from botocore.exceptions import ClientError
from PIL import Image

from app.integrations.cloudinary.client import CloudinaryClient, InvalidImage, validate_image
from app.integrations.r2.client import R2Client
from tests.conftest import make_settings, requires_git

API = "/api/v1"


def png(size=(8, 8), fmt="PNG") -> bytes:
    b = io.BytesIO()
    Image.new("RGB", size, "red").save(b, fmt)
    return b.getvalue()


# ------------------------------------------------------------------ R2
class FakeS3:
    def __init__(self):
        self.objects, self.calls = {}, []

    def put_object(self, Bucket, Key, Body, ContentType, Metadata):
        self.objects[Key] = (Body, ContentType, Metadata)

    def upload_file(self, path, Bucket, Key, ExtraArgs):
        self.objects[Key] = (Path(path).read_bytes(), ExtraArgs["ContentType"], ExtraArgs["Metadata"])

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise KeyError(Key)
        return {"ContentLength": len(self.objects[Key][0])}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def head_bucket(self, Bucket):
        self.calls.append(("head_bucket", Bucket, 0))
        return {}

    def generate_presigned_url(self, op, Params, ExpiresIn):
        self.calls.append(("presign", Params["Key"], ExpiresIn))
        return f"https://r2.example/{Params['Key']}?X-Amz-Expires={ExpiresIn}&sig=abc"


def r2_settings(tmp_path):
    return make_settings(tmp_path, r2_account_id="acct", r2_access_key_id="AK", r2_secret_access_key="SK",
                         r2_bucket_name="bkt")


@pytest.fixture
def s3():
    return FakeS3()


@pytest.fixture
def r2client(tmp_path, client, s3):
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    client.app.state.ctx.r2 = r2
    return r2


async def test_r2_client_ops(tmp_path, s3):
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    sha = await r2.upload_bytes("k", b"hello", "text/plain", {"a": "b"})
    assert sha == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    assert s3.objects["k"][2] == {"a": "b", "sha256": sha}
    await r2.delete("k")
    assert "k" not in s3.objects
    assert "expires=900" in r2.presign_get("x", 99999).lower().replace("expires=900", "expires=900")
    assert s3.calls[-1][2] == 900            # presigned URLs are capped at 15 minutes
    r2.presign_get("x", 0)
    assert s3.calls[-1][2] == 1


async def test_r2_upload_file_integrity_check_deletes_on_mismatch(tmp_path, s3):
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    f = tmp_path / "f.bin"
    f.write_bytes(b"abc")
    sha, size = await r2.upload_file("ok", f)
    assert size == 3 and s3.objects["ok"][2]["sha256"] == sha
    s3.head_object = lambda Bucket, Key: {"ContentLength": 999}   # simulate truncated upload
    with pytest.raises(IOError):
        await r2.upload_file("bad", f)
    assert "bad" not in s3.objects


async def test_r2_status_probes_once_then_caches(tmp_path, s3):
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    assert await r2.status() == "ok" and await r2.status() == "ok"
    assert sum(c[0] == "head_bucket" for c in s3.calls) == 1   # /ready is polled by every open tab

    def gone(Bucket):
        raise RuntimeError("NoSuchBucket")

    s3.head_bucket = gone
    assert await r2.status(ttl=0) == "unavailable"   # ttl=0 forces a re-probe


async def test_r2_status_is_single_flight(tmp_path, s3):
    """A burst of /ready requests must cost one probe: each one holds a thread git also needs."""
    def slow(Bucket):
        s3.calls.append(("head_bucket", Bucket, 0))
        time.sleep(0.05)
        return {}

    s3.head_bucket = slow
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    assert await asyncio.gather(*(r2.status() for _ in range(5))) == ["ok"] * 5
    assert sum(c[0] == "head_bucket" for c in s3.calls) == 1


async def test_r2_status_accepts_an_object_scoped_token(tmp_path, s3):
    """A token scoped to objects is refused HeadBucket but uploads fine: that must not read as "down"."""
    def denied(Bucket):
        raise ClientError({"Error": {"Code": "AccessDenied"}}, "HeadBucket")

    def missing_key(Bucket, Key):
        raise ClientError({"Error": {"Code": "404"}}, "HeadObject")

    s3.head_bucket, s3.head_object = denied, missing_key
    r2 = R2Client(r2_settings(tmp_path), s3=s3)
    assert await r2.status() == "ok"

    def no_bucket(Bucket, Key):   # a wrong bucket name must still fail
        raise ClientError({"Error": {"Code": "NoSuchBucket"}}, "HeadObject")

    s3.head_object = no_bucket
    assert await r2.status(ttl=0) == "unavailable"


def test_r2_endpoint_derivation(tmp_path):
    with patch("app.integrations.r2.client.boto3.client") as mk:
        R2Client(r2_settings(tmp_path))
        kw = mk.call_args.kwargs
        assert kw["endpoint_url"] == "https://acct.r2.cloudflarestorage.com" and kw["region_name"] == "auto"


@requires_git
def test_export_bundle_is_verified_uploaded_and_presigned(client, alice, r2client, s3):
    _, h = alice
    rid = client.post(f"{API}/repositories", headers=h, json={"name": "x"}).json()["id"]
    r = client.post(f"{API}/repositories/{rid}/exports", headers=h)
    assert r.status_code == 201, r.text
    d = r.json()
    body, ctype, meta = s3.objects[d["key"]]
    assert d["key"].startswith(f"exports/{rid}/") and len(body) == d["size"] and meta["sha256"] == d["sha256"]
    assert "sig=abc" in d["download_url"] and d["expires_in"] <= 900
    assert body[:16].startswith(b"# v2 git bundle") or b"git bundle" in body[:32]


def test_export_requires_access_and_config(client, alice, bob, r2client):
    rid = client.post(f"{API}/repositories", headers=alice[1], json={"name": "x"}).json()["id"]
    assert client.post(f"{API}/repositories/{rid}/exports", headers=bob[1]).status_code == 404
    client.app.state.ctx.r2 = None
    assert client.post(f"{API}/repositories/{rid}/exports", headers=alice[1]).json()["error"]["code"] == "integration_not_configured"


def test_uploads_validate_content_and_isolate_users(client, alice, bob, r2client, s3):
    ha, hb = alice[1], bob[1]
    up = lambda h, data, name="f": client.post(f"{API}/uploads", headers=h, files={"file": (name, data, "image/png")})
    r = up(ha, b"%PDF-1.4 hello")
    assert r.status_code == 201 and r.json()["content_type"] == "application/pdf"
    key = f"uploads/{alice[0]}/{r.json()['id']}"
    assert key in s3.objects and s3.objects[key][2]["owner"] == alice[0]
    assert up(ha, png(), "evil.exe").json()["content_type"] == "image/png"           # judged by bytes, not name/MIME
    assert up(ha, b"\x7fELF\x02\x01\x01\x00" + bytes(range(256))).status_code == 422  # binary of unknown type
    assert up(ha, b"plain utf8 \xc3\xa9").json()["content_type"] == "text/plain"
    assert client.get(f"{API}/uploads/{r.json()['id']}", headers=ha).status_code == 200
    assert client.get(f"{API}/uploads/{r.json()['id']}", headers=hb).status_code == 404   # other user's object


def test_upload_size_limit(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app
    from tests.conftest import register_and_login
    with TestClient(create_app(make_settings(tmp_path, max_upload_bytes=2000))) as c:
        c.app.state.ctx.r2 = R2Client(r2_settings(tmp_path), s3=FakeS3())
        _, h = register_and_login(c)
        r = c.post(f"{API}/uploads", headers=h, files={"file": ("a.txt", b"x" * 5000, "text/plain")})
        assert r.status_code == 413


# ------------------------------------------------------------------ Cloudinary
def test_validate_image_checks_real_content():
    assert validate_image(png(), 1_000_000) == "PNG"
    assert validate_image(png(fmt="JPEG"), 1_000_000) == "JPEG"
    assert validate_image(png(fmt="WEBP"), 1_000_000) == "WEBP"
    for bad in (b"not an image at all", png()[:40], png(fmt="GIF"), b"<svg onload=alert(1)></svg>", b""):
        with pytest.raises(InvalidImage):
            validate_image(bad, 1_000_000)
    with pytest.raises(InvalidImage):
        validate_image(png((3000, 3000)), 1_000_000)            # pixel cap


class FakeCloudinary:
    def __init__(self):
        self.uploads, self.deleted = [], []

    async def upload_avatar(self, user_id, data, fmt):
        self.uploads.append((user_id, fmt))
        pid = f"gitarchey/avatars/{user_id}"
        return f"https://res.cloudinary.com/demo/image/upload/{pid}.png", pid

    async def delete_avatar(self, public_id):
        self.deleted.append(public_id)


def test_avatar_endpoints(client, alice):
    uid, h = alice
    fake = client.app.state.ctx.cloudinary = FakeCloudinary()
    put = lambda data, name="a.png": client.put(f"{API}/users/me/avatar", headers=h, files={"file": (name, data, "image/png")})
    r = put(png())
    assert r.status_code == 200 and r.json()["avatar_url"].endswith(f"{uid}.png")
    assert fake.uploads == [(uid, "PNG")]                                # public id derives from the caller only
    assert client.get(f"{API}/users/me", headers=h).json()["avatar_url"]
    assert put(b"GIF89a-not-allowed", "x.png").status_code == 422
    assert put(b"x" * 2_100_000).status_code == 413
    assert client.delete(f"{API}/users/me/avatar", headers=h).status_code == 204
    assert fake.deleted == [f"gitarchey/avatars/{uid}"] and client.get(f"{API}/users/me", headers=h).json()["avatar_url"] is None
    client.app.state.ctx.cloudinary = None
    assert put(png()).json()["error"]["code"] == "integration_not_configured"


async def test_cloudinary_client_uses_server_controlled_id_and_hides_secret(tmp_path):
    s = make_settings(tmp_path, cloudinary_cloud_name="demo", cloudinary_api_key="k", cloudinary_api_secret="TOPSECRET")
    cc = CloudinaryClient(s)
    with patch("app.integrations.cloudinary.client.cloudinary.uploader.upload",
               return_value={"secure_url": "https://x/y.png", "public_id": "gitarchey/avatars/u1"}) as up:
        url, pid = await cc.upload_avatar("u1", b"data", "PNG")
    kw = up.call_args.kwargs
    assert kw["public_id"] == "gitarchey/avatars/u1" and kw["overwrite"] is True
    assert kw["allowed_formats"] == ["png", "jpg", "webp"]
    assert "TOPSECRET" not in repr((url, pid))
    with patch("app.integrations.cloudinary.client.cloudinary.uploader.destroy") as d:
        await cc.delete_avatar("someone/else/asset")                 # outside our namespace: never forwarded
        d.assert_not_called()
        await cc.delete_avatar("gitarchey/avatars/u1")
        d.assert_called_once()
    assert "TOPSECRET" not in repr(s) and "TOPSECRET" not in str(s.model_dump())
