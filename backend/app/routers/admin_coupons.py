"""PLAN 4.6: admin coupon CRUD.

GET/POST/PUT/DELETE /api/admin/coupons. Public coupon validation
lives in /api/checkout (which already enforces starts_at/ends_at and
the global usage_limit — see backend/app/routers/checkout.py:_apply_coupon).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token_dep
from app.database import get_db
from app.models.coupon import Coupon
from app.schemas.coupon import CouponCreate, CouponRead, CouponUpdate
from app.schemas.user import TokenData

router = APIRouter(prefix="/admin/coupons", tags=["admin-coupons"])


def get_current_admin_user(token_data: TokenData | None = Depends(decode_token_dep)):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


@router.get("", response_model=list[CouponRead])
async def list_coupons(
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    rows = (await db.execute(select(Coupon).order_by(Coupon.created_at.desc()))).scalars().all()
    return rows


@router.post("", response_model=CouponRead, status_code=status.HTTP_201_CREATED)
async def create_coupon(
    data: CouponCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    existing = (await db.execute(select(Coupon).where(Coupon.code == data.code))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"Coupon {data.code!r} already exists")

    coupon = Coupon(
        code=data.code,
        discount_type=data.discount_type,
        discount_value=data.discount_value,
        min_order_value=data.min_order_value,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        usage_limit=data.usage_limit,
        per_user_limit=data.per_user_limit,
        is_active=data.is_active,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    return coupon


@router.put("/{coupon_id}", response_model=CouponRead)
async def update_coupon(
    coupon_id: int,
    data: CouponUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    coupon = (
        await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    ).scalar_one_or_none()
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")

    patch = data.model_dump(exclude_unset=True)

    if "code" in patch and patch["code"] != coupon.code:
        clash = (
            await db.execute(select(Coupon).where(Coupon.code == patch["code"]))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail=f"Coupon {patch['code']!r} already exists")

    new_type = patch.get("discount_type", coupon.discount_type)
    new_value = patch.get("discount_value", coupon.discount_value)
    if new_type == "percent" and new_value > 100:
        raise HTTPException(status_code=400, detail="percent discount must be 0-100")
    if new_type == "free_shipping" and new_value != 0:
        raise HTTPException(status_code=400, detail="free_shipping coupons have discount_value=0")

    new_starts = patch.get("starts_at", coupon.starts_at)
    new_ends = patch.get("ends_at", coupon.ends_at)
    if new_ends is not None and new_ends <= new_starts:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    for field, value in patch.items():
        setattr(coupon, field, value)

    await db.commit()
    await db.refresh(coupon)
    return coupon


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coupon(
    coupon_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    coupon = (
        await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    ).scalar_one_or_none()
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await db.delete(coupon)
    await db.commit()
    return None
