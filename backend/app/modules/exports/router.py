"""Repository bundle exports and user uploads, stored in R2 (object storage), served via short-lived presigned URLs."""
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencies import AuthUser, Context, current_user, get_ctx, limit_user
from app.core.exceptions import NotFound, PayloadTooLarge, Unavailable
from app.integrations.cloudinary.client import validate_image
from app.integrations.astra.memory import utcnow
from app.modules.repositories.access import require
from app.utils.validators import InvalidInput, parse_uuid

router = APIRouter(tags=["exports"])
PRESIGN_S = 300

_MAGIC = {"application/pdf": b"%PDF-", "application/zip": b"PK\x03\x04"}


def _r2(ctx: Context):
    if not ctx.r2:
        raise Unavailable("Object storage is not configured", code="integration_not_configured")
    return ctx.r2


@router.post("/repositories/{repo_id}/exports", status_code=201, dependencies=[Depends(limit_user("upload"))])
async def export_repo(repo_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    """Snapshot of ALL refs as a git bundle. Consistency: a point-in-time view of refs at bundle creation
    (git takes its own locks); writes after that are not included. Restore is not implemented."""
    r2 = _r2(ctx)
    repo, _ = await require(ctx, auth.id, repo_id, "reader")
    key = f"exports/{repo['id']}/{utcnow():%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}.bundle"
    with tempfile.TemporaryDirectory(prefix="gitarchey-export-") as tmp:
        dest = Path(tmp) / "repo.bundle"
        await ctx.git.create_bundle(repo["id"], dest)  # includes `git bundle verify`
        sha, size = await r2.upload_file(key, dest, "application/octet-stream",
                                         {"repo_id": repo["id"], "exported_by": auth.id})
    await ctx.store.add_event(repo["id"], auth.id, "repo.exported", {"key": key})
    return {"key": key, "sha256": sha, "size": size, "download_url": r2.presign_get(key, PRESIGN_S, "repo.bundle"),
            "expires_in": PRESIGN_S}


@router.post("/uploads", status_code=201, dependencies=[Depends(limit_user("upload"))])
async def upload_object(file: UploadFile = File(...), auth: AuthUser = Depends(current_user),
                        ctx: Context = Depends(get_ctx)):
    r2 = _r2(ctx)
    limit = ctx.settings.max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise PayloadTooLarge("File too large", code="file_too_large")
    # trust content, not the client-supplied filename or MIME type
    ctype = None
    for t, magic in _MAGIC.items():
        if data.startswith(magic):
            ctype = t
    if ctype is None:
        try:
            ctype = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[
                validate_image(data, ctx.settings.avatar_max_pixels * 4)]
        except Exception:
            try:
                data.decode("utf-8")
                ctype = "text/plain"
            except UnicodeDecodeError:
                raise InvalidInput("Unsupported file type (png, jpeg, webp, pdf, zip, utf-8 text)") from None
    oid = uuid.uuid4().hex
    key = f"uploads/{auth.id}/{oid}"
    sha = await r2.upload_bytes(key, data, ctype, {"owner": auth.id})
    return {"id": oid, "content_type": ctype, "size": len(data), "sha256": sha}


@router.get("/uploads/{upload_id}")
async def get_upload(upload_id: str, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    r2 = _r2(ctx)
    uid = parse_uuid(upload_id, "upload id").replace("-", "")
    key = f"uploads/{auth.id}/{uid}"  # key is derived from the caller's id: other users' objects are unreachable
    try:
        await r2._t(r2.s3.head_object, Bucket=r2.bucket, Key=key)
    except Exception:
        raise NotFound("Upload not found") from None
    return {"download_url": r2.presign_get(key, PRESIGN_S), "expires_in": PRESIGN_S}
