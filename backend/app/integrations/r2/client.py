"""Filebase or Cloudflare R2 through its S3-compatible API (boto3). Object storage only - never a live Git filesystem."""
import asyncio
import hashlib
import logging
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import Settings

log = logging.getLogger("gitarchey.r2")

MAX_PRESIGN_SECONDS = 900
PROBE_KEY = ".gitarchey-probe"   # never written; only its absence is read


def _code(e: ClientError) -> str:
    return str(e.response.get("Error", {}).get("Code", ""))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class R2Client:
    def __init__(self, settings: Settings, s3=None):
        if settings.filebase_configured:
            endpoint, region, key_id = settings.filebase_endpoint_url, "us-east-1", settings.filebase_access_token
            secret, self.bucket = settings.filebase_secret_key.get_secret_value(), settings.filebase_bucket_name
        else:
            endpoint = settings.r2_endpoint_url or f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
            region, key_id, self.bucket = "auto", settings.r2_access_key_id, settings.r2_bucket_name
            secret = settings.r2_secret_access_key.get_secret_value()
        self.endpoint = endpoint
        self._timeout = settings.external_timeout_s
        self._checked_at: float | None = None  # None, not 0.0: time.monotonic() may start above any ttl
        self._status = "unavailable"
        self._probe = asyncio.Lock()
        self.s3 = s3 or boto3.client(
            "s3", endpoint_url=endpoint, region_name=region,
            aws_access_key_id=key_id, aws_secret_access_key=secret,
            config=Config(signature_version="s3v4", connect_timeout=self._timeout, read_timeout=self._timeout * 3,
                          retries={"max_attempts": 3, "mode": "standard"}))

    async def _t(self, fn, *a, **kw):
        return await asyncio.to_thread(lambda: fn(*a, **kw))

    async def ping(self) -> bool:
        """Prove the bucket answers us with these credentials.

        HeadBucket needs bucket-level permission, which an R2 or Filebase token scoped to objects does not
        have. A 403 there says nothing about whether uploads work, so it falls back to a HEAD on a key that
        does not exist: 404 means the credentials were accepted and the bucket resolved, which is exactly
        what an upload needs. A wrong bucket name answers NoSuchBucket, not 404, so it still fails.
        """
        try:
            await self._t(self.s3.head_bucket, Bucket=self.bucket)
        except ClientError as e:
            if _code(e) not in ("403", "AccessDenied", "Forbidden"):
                raise
            try:
                await self._t(self.s3.head_object, Bucket=self.bucket, Key=PROBE_KEY)
            except ClientError as inner:
                if _code(inner) not in ("404", "NoSuchKey", "NotFound"):
                    raise
        return True

    async def status(self, ttl: float = 60.0) -> str:
        """"ok" or "unavailable", cached: /ready is polled by every open tab and head_bucket is a real call.

        Single-flight: /ready needs no auth, so without the lock a burst of concurrent requests would each
        start a probe, and every probe holds a thread from the same default executor that git runs on.
        Waiters re-read the cache the holder just filled instead of probing again. Failures are cached too,
        so an unreachable bucket costs one call per ttl rather than one per request.
        """
        if self._fresh(ttl):
            return self._status
        async with self._probe:
            if self._fresh(ttl):  # filled while we waited
                return self._status
            try:
                await asyncio.wait_for(self.ping(), self._timeout)
                self._status = "ok"
            except Exception as e:  # credentials rejected, bucket gone, endpoint unreachable
                # the UI can only say "unreachable"; the operator needs to know which of those it was
                log.warning("storage_probe_failed", extra={"bucket": self.bucket, "endpoint": self.endpoint,
                                                           "error": f"{type(e).__name__}: {e}"[:300]})
                self._status = "unavailable"
            self._checked_at = time.monotonic()
            return self._status

    def _fresh(self, ttl: float) -> bool:
        return self._checked_at is not None and time.monotonic() - self._checked_at < ttl

    async def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream",
                           metadata: dict | None = None) -> str:
        sha = hashlib.sha256(data).hexdigest()
        await self._t(self.s3.put_object, Bucket=self.bucket, Key=key, Body=data, ContentType=content_type,
                      Metadata={**(metadata or {}), "sha256": sha})
        return sha

    async def upload_file(self, key: str, path: Path, content_type: str = "application/octet-stream",
                          metadata: dict | None = None) -> tuple[str, int]:
        """Upload then verify size via HEAD; returns (sha256, size). sha256 is stored as object metadata."""
        sha, size = await self._t(sha256_file, path), path.stat().st_size
        await self._t(self.s3.upload_file, str(path), self.bucket, key,
                      ExtraArgs={"ContentType": content_type, "Metadata": {**(metadata or {}), "sha256": sha}})
        head = await self._t(self.s3.head_object, Bucket=self.bucket, Key=key)
        if head["ContentLength"] != size:
            await self.delete(key)
            raise IOError("upload integrity check failed")
        return sha, size

    async def download(self, key: str) -> bytes:
        res = await self._t(self.s3.get_object, Bucket=self.bucket, Key=key)
        return await self._t(res["Body"].read)

    async def delete(self, key: str) -> None:
        await self._t(self.s3.delete_object, Bucket=self.bucket, Key=key)

    def presign_get(self, key: str, expires: int = MAX_PRESIGN_SECONDS, filename: str | None = None) -> str:
        params = {"Bucket": self.bucket, "Key": key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        return self.s3.generate_presigned_url("get_object", Params=params,
                                              ExpiresIn=min(max(expires, 1), MAX_PRESIGN_SECONDS))
