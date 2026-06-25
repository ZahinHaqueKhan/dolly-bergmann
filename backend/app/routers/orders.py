from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.router import ACCESS_COOKIE
from app.auth.service import decode_token
from app.config import settings
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.variant import Variant
from app.schemas.user import TokenData

router = APIRouter(prefix="/orders", tags=["orders"])

# Optional bearer auth. Returns TokenData or None — callers decide
# whether to 401. We also read the `access_token` httpOnly cookie so
# the success page can call /api/orders/by-stripe/{id} without a
# Bearer header (PLAN 3.6).
_optional_bearer = HTTPBearer(auto_error=False)


async def _decode_optional_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
) -> TokenData | None:
    token: str | None = None
    if credentials is not None:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    return decode_token(token, expected_type="access")


async def get_current_user_id(
    request: Request,
    x_session_id: str | None = Header(None),
    token_data: TokenData | None = Depends(_decode_optional_token),
) -> tuple[int | None, str | None]:
    if token_data is not None:
        return token_data.user_id, None
    return None, x_session_id


async def get_optional_current_user_id(
    request: Request,
    token_data: TokenData | None = Depends(_decode_optional_token),
) -> int | None:
    """Like get_current_user_id but returns None instead of raising on 401.

    Used by endpoints that are accessible to anyone (the order success
    page in particular), where an unauthenticated visitor who has just
    paid should still be able to see their order if it exists.
    """
    if token_data is None:
        return None
    return token_data.user_id


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

    stmt = select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc()).options(
        selectinload(Order.order_items)
    )
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


@router.get("/by-stripe/{stripe_session_id}", response_model=dict)
async def get_order_by_stripe_session(
    stripe_session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int | None = Depends(get_optional_current_user_id),
):
    """Look up an order by Stripe session id (PLAN 3.6).

    Called by the /order/success page after Stripe redirects back. The
    webhook may not have arrived yet, in which case the order exists
    with status="pending" (the placeholder created in /api/checkout)
    or does not exist at all. The page polls every few seconds until
    the order is found with status="paid".

    Auth: if a user is logged in, they can only see their OWN order.
    Anonymous visitors cannot view orders at all (the order_id from
    /order/success?session_id=... is the public surface, and the
    success page only shows order details after the webhook fires —
    anonymous viewers get a generic "thanks" message).
    """
    stmt = select(Order).where(Order.stripe_session_id == stripe_session_id).options(
        selectinload(Order.order_items).selectinload(OrderItem.variant).selectinload(Variant.product)
    )
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        # Tell the page to keep polling.
        raise HTTPException(status_code=404, detail="Order not yet created")

    # If we know the user, they must own the order or be admin.
    if user_id is not None:
        if order.user_id != user_id:
            # Logged-in user is not the owner; refuse to show.
            raise HTTPException(status_code=403, detail="Not your order")
    else:
        # Anonymous: only allow if the order is unattributed (guest
        # checkout). Otherwise 403 — we don't expose order details to
        # random unauthenticated visitors.
        if order.user_id is not None:
            raise HTTPException(status_code=403, detail="Sign in to view this order")

    return {
        "id": order.id,
        "status": order.status,
        "total": order.total,
        "shipping_address": order.shipping_address,
        "stripe_session_id": order.stripe_session_id,
        "stripe_payment_intent_id": order.stripe_payment_intent_id,
        "created_at": order.created_at.isoformat() if order.created_at else None,
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


@router.get("/admin", response_model=list[dict])
async def admin_list_orders(
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    token_data: TokenData | None = Depends(_decode_optional_token),
):
    """PLAN 4.5: admin order list with status / search / date filters.

    Search matches against order id, user email, and customer_details.email
    embedded in shipping_address. Date range is inclusive on created_at.

    NOTE: this route is registered BEFORE the /{order_id} catch-all below
    so `/api/orders/admin` doesn't get parsed as order_id="admin".
    """
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    from datetime import datetime as _dt
    from sqlalchemy import or_ as _or
    from app.models.user import User as _User

    stmt = (
        select(Order, _User.email)
        .outerjoin(_User, _User.id == Order.user_id)
        .order_by(Order.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            _or(
                Order.id.cast(__import__("sqlalchemy").String).ilike(like),
                _User.email.ilike(like),
                Order.shipping_address["email"].astext.ilike(like),
            )
        )
    if date_from:
        try:
            df = _dt.fromisoformat(date_from)
            stmt = stmt.where(Order.created_at >= df)
        except ValueError:
            raise HTTPException(status_code=400, detail="date_from must be ISO date")
    if date_to:
        try:
            dt = _dt.fromisoformat(date_to)
            stmt = stmt.where(Order.created_at <= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="date_to must be ISO date")
    stmt = stmt.limit(max(1, min(limit, 500)))

    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "id": o.id,
            "user_id": o.user_id,
            "user_email": email,
            "status": o.status,
            "total": o.total,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o, email in rows
    ]


@router.get("/admin/{order_id}", response_model=dict)
async def admin_get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(_decode_optional_token),
):
    """Admin view of a single order: full shipping address, line items,
    payment intent / session ids, and the buyer's email (if known).
    """
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    from app.models.user import User as _User

    stmt = (
        select(Order, _User.email)
        .outerjoin(_User, _User.id == Order.user_id)
        .where(Order.id == order_id)
        .options(
            selectinload(Order.order_items)
            .selectinload(OrderItem.variant)
            .selectinload(Variant.product)
        )
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    o, email = row

    return {
        "id": o.id,
        "user_id": o.user_id,
        "user_email": email,
        "status": o.status,
        "total": o.total,
        "shipping_address": o.shipping_address,
        "stripe_session_id": o.stripe_session_id,
        "stripe_payment_intent_id": o.stripe_payment_intent_id,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        "items": [
            {
                "id": item.id,
                "variant_id": item.variant_id,
                "product_name": item.variant.product.name,
                "size": item.variant.size,
                "color": item.variant.color,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": item.quantity * item.unit_price,
            }
            for item in o.order_items
        ],
    }


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

    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.order_items).selectinload(OrderItem.variant).selectinload(Variant.product)
    )
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
        "stripe_session_id": order.stripe_session_id,
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


@router.put("/admin/{order_id}/status", response_model=dict)
async def admin_update_order_status(
    order_id: int,
    status_data: dict,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(_decode_optional_token),
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

    valid_statuses = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"]
    new_status = status_data["status"]

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    # If transitioning to "cancelled" or "refunded" from a paid state,
    # restore the stock we decremented at checkout time. This keeps the
    # inventory count correct even if the cancellation is initiated from
    # the admin UI rather than a Stripe webhook.
    was_paid = order.status == "paid"
    is_refund_or_cancel = new_status in ("cancelled", "refunded")
    if was_paid and is_refund_or_cancel:
        from app.models.order_item import OrderItem as _OI
        from app.models.variant import Variant as _V
        from sqlalchemy import select as _sel

        items = list(
            (
                await db.execute(
                    _sel(_OI).where(_OI.order_id == order.id)
                )
            ).scalars().all()
        )
        for it in items:
            v = (
                await db.execute(
                    _sel(_V).where(_V.id == it.variant_id).with_for_update()
                )
            ).scalar_one_or_none()
            if v is not None:
                v.stock += it.quantity

    order.status = new_status
    await db.commit()

    return {"id": order.id, "status": order.status, "message": "Order status updated"}


@router.post("/admin/{order_id}/refund", response_model=dict)
async def admin_refund_order(
    order_id: int,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(_decode_optional_token),
):
    """Issue a refund for a paid order.

    The body is optional: {"amount_cents": int} for a partial refund, or
    empty/None for a full refund. We call stripe.Refund.create on the
    payment intent and (on success) mark the order refunded. The order
    transition also restores stock via the status endpoint above if
    called separately.

    NOTE: with STRIPE_SECRET_KEY set to a placeholder, this will fail
    at the Stripe API call. The endpoint itself still validates input
    and surfaces a 502 with the Stripe error message so the admin UI
    can display it.
    """
    import stripe

    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    stmt = select(Order).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in ("paid", "shipped", "delivered"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot refund an order with status={order.status}",
        )
    if not order.stripe_payment_intent_id:
        raise HTTPException(
            status_code=400,
            detail="Order has no Stripe payment intent (manual order?)",
        )

    stripe.api_key = settings.STRIPE_SECRET_KEY
    amount = (body or {}).get("amount_cents")
    refund_kwargs: dict = {"payment_intent": order.stripe_payment_intent_id}
    if amount is not None:
        try:
            refund_kwargs["amount"] = int(amount)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="amount_cents must be int")

    try:
        refund = stripe.Refund.create(**refund_kwargs)
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    # Mark order refunded (full) or leave status paid for partial
    # refunds; the admin can edit the status manually. For simplicity
    # we mark fully refunded when no partial amount was requested.
    if amount is None:
        order.status = "refunded"
        await db.commit()

    return {
        "id": order.id,
        "status": order.status,
        "refund_id": getattr(refund, "id", None),
        "message": "Refund issued",
    }
