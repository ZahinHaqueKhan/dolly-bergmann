from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.variant import Variant
from app.schemas.user import TokenData

router = APIRouter(prefix="/orders", tags=["orders"])


async def get_current_user_id(
    token_data: Annotated[TokenData | None, Depends(decode_token)],
    x_session_id: str | None = Header(None),
) -> tuple[int | None, str | None]:
    if token_data:
        return token_data.user_id, None
    return None, x_session_id


@router.get("", response_model=list[dict])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    current_user: tuple = Depends(get_current_user_id),
):
    user_id, _ = current_user
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc())
    result = await db.execute(stmt)
    orders = result.scalars().all()

    return [
        {
            "id": o.id,
            "status": o.status,
            "total": o.total,
            "created_at": o.created_at,
            "items_count": len(o.order_items),
        }
        for o in orders
    ]


@router.get("/{order_id}", response_model=dict)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: tuple = Depends(get_current_user_id),
):
    user_id, _ = current_user
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = select(Order).where(Order.id == order_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    if order.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this order",
        )

    return {
        "id": order.id,
        "status": order.status,
        "total": order.total,
        "shipping_address": order.shipping_address,
        "stripe_payment_intent_id": order.stripe_payment_intent_id,
        "created_at": order.created_at,
        "items": [
            {
                "product_name": item.variant.product.name,
                "size": item.variant.size,
                "color": item.variant.color,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": item.quantity * item.unit_price,
            }
            for item in order.order_items
        ],
    }


@router.post("", response_model=dict)
async def create_order(
    order_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: tuple = Depends(get_current_user_id),
):
    user_id, session_id = current_user

    stmt = select(CartItem).where(
        (CartItem.user_id == user_id) if user_id else (CartItem.session_id == session_id)
    )
    result = await db.execute(stmt)
    cart_items = result.scalars().all()

    if not cart_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cart is empty",
        )

    total = 0
    order_items_data = []

    for cart_item in cart_items:
        variant_stmt = select(Variant).where(Variant.id == cart_item.variant_id)
        result = await db.execute(variant_stmt)
        variant = result.scalar_one_or_none()

        if variant is None or variant.stock < cart_item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Variant {variant.sku if variant else cart_item.variant_id} out of stock",
            )

        subtotal = variant.price * cart_item.quantity
        total += subtotal
        order_items_data.append({
            "variant": variant,
            "quantity": cart_item.quantity,
            "unit_price": variant.price,
        })

    order = Order(
        user_id=user_id,
        status="pending",
        total=total,
        shipping_address=order_data["shipping_address"],
    )
    db.add(order)
    await db.flush()

    for item_data in order_items_data:
        order_item = OrderItem(
            order_id=order.id,
            variant_id=item_data["variant"].id,
            quantity=item_data["quantity"],
            unit_price=item_data["unit_price"],
        )
        db.add(order_item)

        item_data["variant"].stock -= item_data["quantity"]

    for cart_item in cart_items:
        await db.delete(cart_item)

    await db.commit()
    await db.refresh(order)

    return {"id": order.id, "status": order.status, "total": order.total}


@router.get("/admin", response_model=list[dict])
async def admin_list_orders(
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
    token_data: Annotated[TokenData | None, Depends(decode_token)] = None,
):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    stmt = select(Order).order_by(Order.created_at.desc())
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)

    result = await db.execute(stmt)
    orders = result.scalars().all()

    return [
        {
            "id": o.id,
            "user_id": o.user_id,
            "status": o.status,
            "total": o.total,
            "created_at": o.created_at,
        }
        for o in orders
    ]


@router.put("/admin/{order_id}/status", response_model=dict)
async def admin_update_order_status(
    order_id: int,
    status_data: dict,
    db: AsyncSession = Depends(get_db),
    token_data: Annotated[TokenData | None, Depends(decode_token)] = None,
):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    stmt = select(Order).where(Order.id == order_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    valid_statuses = ["pending", "paid", "shipped", "delivered", "cancelled"]
    new_status = status_data["status"]

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    order.status = new_status
    await db.commit()

    return {"id": order.id, "status": order.status, "message": "Order status updated"}
