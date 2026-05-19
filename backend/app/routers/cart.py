import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cart_item import CartItem
from app.models.variant import Variant

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=dict)
async def get_cart(
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    user_id: int | None = None,
):
    if user_id is None and x_session_id is None:
        x_session_id = str(uuid.uuid4())

    stmt = select(CartItem).where(
        (CartItem.user_id == user_id) if user_id else (CartItem.session_id == x_session_id)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    total = sum(item.variant.price * item.quantity for item in items)

    return {
        "items": [
            {
                "id": item.id,
                "variant_id": item.variant_id,
                "quantity": item.quantity,
                "product_name": item.variant.product.name,
                "size": item.variant.size,
                "color": item.variant.color,
                "price": item.variant.price,
                "subtotal": item.variant.price * item.quantity,
            }
            for item in items
        ],
        "total": total,
        "session_id": x_session_id,
    }


@router.post("/items", response_model=dict)
async def add_to_cart(
    item_data: dict,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    user_id: int | None = None,
):
    if user_id is None and x_session_id is None:
        x_session_id = str(uuid.uuid4())

    variant_stmt = select(Variant).where(Variant.id == item_data["variant_id"])
    result = await db.execute(variant_stmt)
    variant = result.scalar_one_or_none()

    if variant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variant not found",
        )

    stmt = select(CartItem).where(
        (CartItem.user_id == user_id) if user_id else (CartItem.session_id == x_session_id),
        CartItem.variant_id == item_data["variant_id"],
    )
    result = await db.execute(stmt)
    existing_item = result.scalar_one_or_none()

    if existing_item:
        existing_item.quantity += item_data.get("quantity", 1)
    else:
        cart_item = CartItem(
            user_id=user_id,
            session_id=x_session_id if not user_id else None,
            variant_id=item_data["variant_id"],
            quantity=item_data.get("quantity", 1),
        )
        db.add(cart_item)

    await db.commit()

    return {"message": "Item added to cart", "session_id": x_session_id}


@router.put("/items/{item_id}", response_model=dict)
async def update_cart_item(
    item_id: int,
    item_data: dict,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    user_id: int | None = None,
):
    stmt = select(CartItem).where(CartItem.id == item_id)
    result = await db.execute(stmt)
    cart_item = result.scalar_one_or_none()

    if cart_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found",
        )

    if user_id:
        if cart_item.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this cart item",
            )
    else:
        if cart_item.session_id != x_session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this cart item",
            )

    cart_item.quantity = item_data.get("quantity", 1)
    await db.commit()

    return {"message": "Cart item updated"}


@router.delete("/items/{item_id}", response_model=dict)
async def remove_cart_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    user_id: int | None = None,
):
    stmt = select(CartItem).where(CartItem.id == item_id)
    result = await db.execute(stmt)
    cart_item = result.scalar_one_or_none()

    if cart_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found",
        )

    if user_id:
        if cart_item.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to remove this cart item",
            )
    else:
        if cart_item.session_id != x_session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to remove this cart item",
            )

    await db.delete(cart_item)
    await db.commit()

    return {"message": "Item removed from cart"}


@router.delete("", response_model=dict)
async def clear_cart(
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    user_id: int | None = None,
):
    stmt = select(CartItem).where(
        (CartItem.user_id == user_id) if user_id else (CartItem.session_id == x_session_id)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    for item in items:
        await db.delete(item)

    await db.commit()

    return {"message": "Cart cleared"}
