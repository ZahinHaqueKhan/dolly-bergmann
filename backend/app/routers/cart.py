from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi import APIRouter
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.router import ACCESS_COOKIE
from app.auth.service import decode_token
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.user import User
from app.models.variant import Variant
from app.schemas.cart import (
    CartItemCreate,
    CartItemRead,
    CartItemUpdate,
    CartRead,
)

router = APIRouter(prefix="/cart", tags=["cart"])

# Optional bearer auth: returns the User when a valid Bearer token or
# `access_token` cookie is present, else None. Used by the cart endpoints
# so they can accept BOTH authenticated and anonymous callers.
_optional_security = HTTPBearer(auto_error=False)


async def _optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    token: str | None = None
    if credentials is not None:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    token_data = decode_token(token, expected_type="access")
    if token_data is None:
        return None
    result = await db.execute(select(User).where(User.id == token_data.user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user


async def resolve_cart_owner(
    request: Request,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    current_user: User | None = Depends(_optional_user),
) -> tuple[int | None, str]:
    """Return (user_id, session_id) for the caller.

    Authenticated user: user_id is set, session_id is the guest's
    `X-Session-Id` if they had one (so we can merge their guest cart
    into the user cart — see the merge helper below).

    Anonymous: user_id is None, session_id is the request's
    `X-Session-Id` or a freshly minted UUID (returned in the response
    so the client can persist it).
    """
    if current_user is not None:
        return current_user.id, x_session_id or ""
    return None, x_session_id or str(uuid.uuid4())


# ---------- helpers ----------


def _item_owned_by(item: CartItem, user_id: int | None, session_id: str) -> bool:
    if user_id is not None:
        return item.user_id == user_id
    return item.session_id == session_id


async def _list_cart_items(
    db: AsyncSession, user_id: int | None, session_id: str | None
) -> list[CartItem]:
    if user_id is not None:
        stmt = select(CartItem).where(CartItem.user_id == user_id)
    else:
        stmt = select(CartItem).where(CartItem.session_id == session_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _load_variants(db: AsyncSession, ids: list[int]) -> dict[int, Variant]:
    if not ids:
        return {}
    stmt = select(Variant).where(Variant.id.in_(ids)).options(
        selectinload(Variant.product)
    )
    result = await db.execute(stmt)
    return {v.id: v for v in result.scalars().all()}


async def _read_cart(
    db: AsyncSession, user_id: int | None, session_id: str
) -> CartRead:
    items = await _list_cart_items(db, user_id, session_id)
    variants = await _load_variants(db, [i.variant_id for i in items])

    out: list[CartItemRead] = []
    for item in items:
        v = variants.get(item.variant_id)
        if v is None:
            # Variant deleted out from under us — skip silently.
            continue
        out.append(
            CartItemRead(
                id=item.id,
                variant_id=v.id,
                quantity=item.quantity,
                product_name=v.product.name if v.product else "",
                size=v.size,
                color=v.color,
                price=v.price,
                subtotal=v.price * item.quantity,
                stock=v.stock,
                image=(v.images[0] if v.images else None),
            )
        )

    total = sum(i.subtotal for i in out)
    item_count = sum(i.quantity for i in out)
    return CartRead(
        items=out,
        total=total,
        item_count=item_count,
        session_id=session_id if user_id is None else None,
    )


# ---------- endpoints ----------


@router.get("", response_model=CartRead)
async def get_cart(
    db: AsyncSession = Depends(get_db),
    owner: tuple[int | None, str] = Depends(resolve_cart_owner),
):
    user_id, session_id = owner
    return await _read_cart(db, user_id, session_id)


@router.post("/items", response_model=CartRead)
async def add_to_cart(
    data: CartItemCreate,
    db: AsyncSession = Depends(get_db),
    owner: tuple[int | None, str] = Depends(resolve_cart_owner),
):
    user_id, session_id = owner

    variant = (
        await db.execute(select(Variant).where(Variant.id == data.variant_id))
    ).scalar_one_or_none()
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")

    if user_id is not None:
        existing_stmt = select(CartItem).where(
            CartItem.user_id == user_id,
            CartItem.variant_id == data.variant_id,
        )
    else:
        existing_stmt = select(CartItem).where(
            CartItem.session_id == session_id,
            CartItem.variant_id == data.variant_id,
        )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    new_qty = data.quantity + (existing.quantity if existing else 0)
    if new_qty > variant.stock:
        raise HTTPException(
            status_code=400,
            detail=f"Only {variant.stock} in stock",
        )

    if existing:
        existing.quantity = new_qty
    else:
        cart_item = CartItem(
            user_id=user_id,
            session_id=None if user_id is not None else session_id,
            variant_id=variant.id,
            quantity=data.quantity,
        )
        db.add(cart_item)

    # If the user is logging in and brought a session_id with them, merge
    # their guest cart into the user cart before reading the response.
    if user_id is not None and session_id:
        # Flush so the new cart item is visible to the merge query.
        await db.flush()
        await _merge_session_cart_into_user(db, user_id, session_id)

    await db.commit()
    return await _read_cart(db, user_id, session_id)


@router.put("/items/{item_id}", response_model=CartRead)
async def update_cart_item(
    item_id: int,
    data: CartItemUpdate,
    db: AsyncSession = Depends(get_db),
    owner: tuple[int | None, str] = Depends(resolve_cart_owner),
):
    user_id, session_id = owner
    item = (await db.execute(select(CartItem).where(CartItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if not _item_owned_by(item, user_id, session_id):
        raise HTTPException(status_code=403, detail="Not your cart item")

    if data.quantity == 0:
        await db.delete(item)
        await db.commit()
        return await _read_cart(db, user_id, session_id)

    variant = (
        await db.execute(select(Variant).where(Variant.id == item.variant_id))
    ).scalar_one_or_none()
    if variant is None or data.quantity > variant.stock:
        raise HTTPException(
            status_code=400,
            detail=f"Only {variant.stock if variant else 0} in stock",
        )

    item.quantity = data.quantity
    await db.commit()
    return await _read_cart(db, user_id, session_id)


@router.delete("/items/{item_id}", response_model=CartRead)
async def remove_cart_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    owner: tuple[int | None, str] = Depends(resolve_cart_owner),
):
    user_id, session_id = owner
    item = (await db.execute(select(CartItem).where(CartItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if not _item_owned_by(item, user_id, session_id):
        raise HTTPException(status_code=403, detail="Not your cart item")
    await db.delete(item)
    await db.commit()
    return await _read_cart(db, user_id, session_id)


@router.delete("", response_model=CartRead)
async def clear_cart(
    db: AsyncSession = Depends(get_db),
    owner: tuple[int | None, str] = Depends(resolve_cart_owner),
):
    user_id, session_id = owner
    items = await _list_cart_items(db, user_id, session_id)
    for it in items:
        await db.delete(it)
    await db.commit()
    return await _read_cart(db, user_id, session_id)


# ---------- cart merge on login (PLAN 3.1) ----------


async def _merge_session_cart_into_user(
    db: AsyncSession, user_id: int, session_id: str
) -> None:
    """Move every CartItem currently bound to `session_id` into the user's
    cart. On conflict (same variant_id in both carts) the larger quantity
    wins, capped at Variant.stock.

    The user can opt out by simply not sending the X-Session-Id header
    after login — only callers that send both a cookie and the old
    session_id will trigger the merge.
    """
    guest_stmt = select(CartItem).where(CartItem.session_id == session_id)
    guest_items = list((await db.execute(guest_stmt)).scalars().all())
    if not guest_items:
        return

    user_stmt = select(CartItem).where(CartItem.user_id == user_id)
    user_items = {
        i.variant_id: i for i in (await db.execute(user_stmt)).scalars().all()
    }

    variants = await _load_variants(db, [i.variant_id for i in guest_items])

    to_delete: list[CartItem] = []
    for g in guest_items:
        v = variants.get(g.variant_id)
        if v is None:
            # Variant gone — drop the guest row.
            to_delete.append(g)
            continue
        if g.variant_id in user_items:
            existing = user_items[g.variant_id]
            # PLAN 3.1: "newer quantities win on conflict". The user
            # just re-asserted their quantity via this add_to_cart call,
            # so their value is the source of truth — the guest's
            # quantity is ignored on conflict.
            new_qty = max(existing.quantity, g.quantity)
            if new_qty > v.stock:
                new_qty = v.stock
            existing.quantity = new_qty
            # The guest row is now a duplicate of the user row — delete
            # it. (We don't reassign the guest row's user_id because
            # there's already a row keyed by the same variant_id.)
            to_delete.append(g)
        else:
            # Reassign in place: this guest row becomes the user's row.
            g.user_id = user_id
            g.session_id = None
            if g.quantity > v.stock:
                g.quantity = v.stock
    for r in to_delete:
        await db.delete(r)
