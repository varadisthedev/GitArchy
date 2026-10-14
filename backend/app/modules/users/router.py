from fastapi import APIRouter, Depends, File, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.dependencies import AuthUser, Context, current_user, get_ctx, limit_user
from app.core.exceptions import PayloadTooLarge, Unavailable
from app.integrations.cloudinary.client import validate_image
from app.modules.auth.schemas import UserPublic, clean_display_name
from app.modules.auth.service import public

router = APIRouter(prefix="/users", tags=["users"])


class UpdateMe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(None, min_length=1, max_length=50)

    @field_validator("display_name")
    @classmethod
    def _name(cls, v):
        return clean_display_name(v) if v is not None else v


@router.get("/me", response_model=UserPublic)
async def me(auth: AuthUser = Depends(current_user)):
    return public(auth.user)


@router.patch("/me", response_model=UserPublic)
async def update_me(body: UpdateMe, auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    fields = body.model_dump(exclude_none=True)
    user = await ctx.store.update_user(auth.id, **fields) if fields else auth.user
    return public(user)


@router.put("/me/avatar", response_model=UserPublic, dependencies=[Depends(limit_user("upload"))])
async def set_avatar(file: UploadFile = File(...), auth: AuthUser = Depends(current_user),
                     ctx: Context = Depends(get_ctx)):
    if not ctx.cloudinary:
        raise Unavailable("Avatar uploads are not configured", code="integration_not_configured")
    data = await file.read(ctx.settings.avatar_max_bytes + 1)  # bounded read
    if len(data) > ctx.settings.avatar_max_bytes:
        raise PayloadTooLarge("Image too large", code="image_too_large")
    fmt = validate_image(data, ctx.settings.avatar_max_pixels)  # checks real content, not filename/MIME
    url, public_id = await ctx.cloudinary.upload_avatar(auth.id, data, fmt)
    user = await ctx.store.update_user(auth.id, avatar_url=url, avatar_public_id=public_id)
    return public(user)


@router.delete("/me/avatar", status_code=204)
async def delete_avatar(auth: AuthUser = Depends(current_user), ctx: Context = Depends(get_ctx)):
    if auth.user.get("avatar_public_id") and ctx.cloudinary:
        await ctx.cloudinary.delete_avatar(auth.user["avatar_public_id"])
    await ctx.store.update_user(auth.id, avatar_url=None, avatar_public_id=None)
    return Response(status_code=204)
