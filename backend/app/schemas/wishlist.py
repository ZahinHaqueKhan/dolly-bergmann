from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WishlistAdd(BaseModel):
    product_id: int = Field(..., gt=0)


class WishlistItemRead(BaseModel):
    """A wishlist row joined with the product fields the UI needs to render a
    ProductCard. We do not return the full Product schema (variants, etc.)
    because the wishlist page just needs a grid of cards."""

    id: int
    product_id: int
    name: str
    slug: str
    image: str | None = None
    # Lowest-variant price in major units (cents / 100), like the existing
    # /api/products response. May be 0 if the product has no variants.
    min_price: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class WishlistRead(BaseModel):
    items: list[WishlistItemRead]


class WishlistToggleResponse(BaseModel):
    """Response for POST /api/wishlist. Returns the new state so the UI can
    update the heart icon without re-fetching the list."""

    product_id: int
    saved: bool
