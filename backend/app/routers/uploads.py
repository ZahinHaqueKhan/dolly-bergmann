"""PLAN 4.3: local image upload endpoint.

Files are written to /uploads/products/{uuid}.{ext} and served back
through /api/uploads. We don't use S3/Cloudflare in v1 — this is a
single-VM dev setup; a future phase will move to object storage.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.staticfiles import StaticFiles

from app.auth.service import decode_token_dep
from app.schemas.user import TokenData


router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_ROOT = Path(os.environ.get("UPLOAD_DIR", "uploads")).resolve()
PRODUCTS_DIR = UPLOAD_ROOT / "products"

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
MAX_BYTES = 8 * 1024 * 1024  # 8 MB
_EXT_FOR_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
}


def get_current_admin_user(token_data: TokenData | None = Depends(decode_token_dep)):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


@router.post("", response_model=dict)
async def upload_image(
    file: UploadFile = File(...),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"unsupported content type {file.content_type!r}; "
                f"allowed: {sorted(ALLOWED_CONTENT_TYPES)}"
            ),
        )

    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

    # Read in chunks so a 1GB upload doesn't blow up RAM.
    ext = _EXT_FOR_TYPE[file.content_type]
    name = f"{secrets.token_urlsafe(16)}.{ext}"
    target = PRODUCTS_DIR / name

    written = 0
    with target.open("wb") as out:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_BYTES:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"file too large (> {MAX_BYTES // (1024 * 1024)} MB)",
                )
            out.write(chunk)

    # Public URL: served back by StaticFiles at /uploads below.
    return {"url": f"/uploads/products/{name}", "bytes": written, "content_type": file.content_type}


def mount_uploads(app) -> None:
    """Mount the local /uploads StaticFiles app. Called from main.py."""
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    (UPLOAD_ROOT / "products").mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads",
        StaticFiles(directory=str(UPLOAD_ROOT)),
        name="uploads",
    )
