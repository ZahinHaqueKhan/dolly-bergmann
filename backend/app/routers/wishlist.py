from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.router import get_current_user
from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.models.variant import Variant
from app.models.wishlist_item import WishlistItem
from app.schemas.wishlist import (
    WishlistAdd,
    WishlistItemRead,
    WishlistRead,
    WishlistToggleResponse,
)

router = APIRouter(prefix="/api/wishlist", tags=["wishlist"])


def _serialize(item: WishlistItem) -> WishlistItemRead:
    product = item.product
    image = product.images[0] if product.images else None
    prices = [v.price for v in product.variants if v.price is not None]
    min_price = (min(prices) / 100.0) if prices else 0.0
    return WishlistItemRead(
        id=item.id,
        product_id=product.id,
        name=product.name,
        slug=product.slug,
        image=image,
        min_price=min_price,
        created_at=item.created_at,
    )


@router.get("", response_model=WishlistRead)
async def list_wishlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's wishlist with product details hydrated."""
    result = await db.execute(
        select(WishlistItem)
        .where(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .options(selectinload(WishlistItem.product).selectinload(Product.variants))
    )
    items = result.scalars().all()
    return WishlistRead(items=[_serialize(i) for i in items])


@router.post("", response_model=WishlistToggleResponse)
async def toggle_wishlist(
    body: WishlistAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a product to the wishlist, or remove it if already saved (toggle).

    Plan 2.6 specifies POST /api/wishlist. The UI calls this on a heart
    click and uses the returned `saved` flag to flip the icon state.
    """
    product_result = await db.execute(
        select(Product).where(Product.id == body.product_id)
    )
    if product_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    existing = await db.execute(
        select(WishlistItem).where(
            WishlistItem.user_id == current_user.id,
            WishlistItem.product_id == body.product_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()
        return WishlistToggleResponse(product_id=body.product_id, saved=False)

    item = WishlistItem(
        user_id=current_user.id,
        product_id=body.product_id,
        created_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    return WishlistToggleResponse(product_id=body.product_id, saved=True)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_wishlist(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a product from the wishlist. Idempotent: 204 whether or not
    the row existed (matches REST convention for DELETE)."""
    result = await db.execute(
        select(WishlistItem).where(
            WishlistItem.user_id == current_user.id,
            WishlistItem.product_id == product_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
