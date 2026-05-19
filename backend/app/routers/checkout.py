import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.config import settings
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.coupon import Coupon
from app.models.variant import Variant

router = APIRouter(prefix="/checkout", tags=["checkout"])


class CheckoutRequest(BaseModel):
    shipping_address: dict
    coupon_code: str | None = None


@router.post("", response_model=dict)
async def create_checkout_session(
    checkout_data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    token_data=Depends(decode_token),
):
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    user_id = token_data.user_id if token_data else None

    if user_id is None and x_session_id is None:
        x_session_id = str(uuid.uuid4())

    stmt = select(CartItem).where(
        (CartItem.user_id == user_id) if user_id else (CartItem.session_id == x_session_id)
    )
    result = await db.execute(stmt)
    cart_items = result.scalars().all()

    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    total = 0
    line_items = []

    for cart_item in cart_items:
        variant_stmt = select(Variant).where(Variant.id == cart_item.variant_id)
        result = await db.execute(variant_stmt)
        variant = result.scalar_one_or_none()

        if variant is None or variant.stock < cart_item.quantity:
            raise HTTPException(status_code=400, detail=f"Variant out of stock")

        subtotal = variant.price * cart_item.quantity
        total += subtotal

        line_items.append({
            "price_data": {
                "currency": "usd",
                "product_data": {
                    "name": variant.product.name,
                    "description": f"Size: {variant.size}, Color: {variant.color}",
                },
                "unit_amount": variant.price,
            },
            "quantity": cart_item.quantity,
        })

    discount = 0
    if checkout_data.coupon_code:
        coupon_stmt = select(Coupon).where(Coupon.code == checkout_data.coupon_code)
        result = await db.execute(coupon_stmt)
        coupon = result.scalar_one_or_none()

        if coupon is None:
            raise HTTPException(status_code=400, detail="Invalid coupon code")

        if coupon.usage_limit and coupon.used_count >= coupon.usage_limit:
            raise HTTPException(status_code=400, detail="Coupon usage limit reached")

        if total < coupon.min_order_value:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order value for coupon: ${coupon.min_order_value / 100}",
            )

        if coupon.discount_type == "percent":
            discount = int(total * coupon.discount_value / 100)
        elif coupon.discount_type == "fixed":
            discount = coupon.discount_value

        total -= discount

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            success_url=f"{settings.FRONTEND_URL}/order/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/cart",
            metadata={
                "user_id": str(user_id) if user_id else "",
                "session_id": x_session_id or "",
            },
            discounts=[{"coupon": {"code": checkout_data.coupon_code}}] if checkout_data.coupon_code else [],
        )

        return {"checkout_url": session.url, "session_id": session.id, "total": total}

    except stripe.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
