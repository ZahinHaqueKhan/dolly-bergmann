from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.order import Order

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str = Header(None),
):
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    webhook_secret = settings.STRIPE_WEBHOOK_SECRET

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, webhook_secret
        )
    except (stripe.error.SignatureVerificationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook signature: {str(e)}")

    session = event.get("data", {}).get("object", {})

    if event["type"] == "checkout.session.completed":
        payment_intent = session.get("payment_intent")
        metadata = session.get("metadata", {})
        user_id = metadata.get("user_id")
        session_id = metadata.get("session_id")

        stmt = select(Order).where(Order.stripe_payment_intent_id == payment_intent)
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()

        if order is None:
            from app.models.cart_item import CartItem

            cart_stmt = select(CartItem).where(
                (CartItem.user_id == int(user_id)) if user_id else (CartItem.session_id == session_id)
            )
            result = await db.execute(cart_stmt)
            cart_items = result.scalars().all()

            if cart_items:
                total = sum(item.variant.price * item.quantity for item in cart_items)

                order = Order(
                    user_id=int(user_id) if user_id else None,
                    status="paid",
                    total=total,
                    shipping_address={},
                    stripe_payment_intent_id=payment_intent,
                )
                db.add(order)

                for cart_item in cart_items:
                    from app.models.order_item import OrderItem

                    order_item = OrderItem(
                        order_id=order.id,
                        variant_id=cart_item.variant_id,
                        quantity=cart_item.quantity,
                        unit_price=cart_item.variant.price,
                    )
                    db.add(order_item)
                    cart_item.variant.stock -= cart_item.quantity
                    await db.delete(cart_item)

                await db.commit()
        else:
            order.status = "paid"
            await db.commit()

    elif event["type"] == "payment_intent.payment_failed":
        payment_intent = session.get("id")

        stmt = select(Order).where(Order.stripe_payment_intent_id == payment_intent)
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()

        if order:
            order.status = "cancelled"
            await db.commit()

    return {"status": "success"}
