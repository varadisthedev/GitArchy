"""Cloudinary avatars only. The API secret stays server-side: the server uploads, the browser never signs anything.

Public IDs are server-controlled (`gitarchey/avatars/<user_id>`), so a user can only ever overwrite their own avatar.
"""
import asyncio
import io

import cloudinary
import cloudinary.uploader
from PIL import Image, UnidentifiedImageError

from app.core.config import Settings
from app.core.exceptions import AppError

ALLOWED_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


class InvalidImage(AppError):
    status, code = 422, "invalid_image"


def validate_image(data: bytes, max_pixels: int) -> str:
    """Decode the actual bytes (Pillow), allow PNG/JPEG/WEBP only, cap decoded pixel count. Returns format."""
    Image.MAX_IMAGE_PIXELS = max_pixels  # Pillow raises DecompressionBombError beyond 2x this
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            if fmt not in ALLOWED_FORMATS:
                raise InvalidImage("Only PNG, JPEG or WEBP images are allowed")
            if im.width * im.height > max_pixels:
                raise InvalidImage("Image dimensions too large")
            im.verify()
    except InvalidImage:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise InvalidImage("File is not a valid image") from None
    return fmt


class CloudinaryClient:
    def __init__(self, settings: Settings):
        self._cfg = dict(cloud_name=settings.cloudinary_cloud_name, api_key=settings.cloudinary_api_key,
                         api_secret=settings.cloudinary_api_secret.get_secret_value(), secure=True)
        self._timeout = settings.external_timeout_s

    async def upload_avatar(self, user_id: str, data: bytes, fmt: str) -> tuple[str, str]:
        def _up():
            return cloudinary.uploader.upload(
                data, public_id=f"gitarchey/avatars/{user_id}", overwrite=True, invalidate=True,
                resource_type="image", allowed_formats=list(ALLOWED_FORMATS.values()),
                transformation=[{"width": 512, "height": 512, "crop": "fill", "gravity": "auto"}],
                timeout=self._timeout, **self._cfg)
        res = await asyncio.wait_for(asyncio.to_thread(_up), self._timeout + 5)
        return res["secure_url"], res["public_id"]

    async def delete_avatar(self, public_id: str) -> None:
        if not public_id.startswith("gitarchey/avatars/"):  # never delete anything outside our namespace
            return
        await asyncio.wait_for(asyncio.to_thread(
            lambda: cloudinary.uploader.destroy(public_id, invalidate=True, timeout=self._timeout, **self._cfg)),
            self._timeout + 5)
