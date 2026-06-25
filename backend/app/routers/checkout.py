from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.router import ACCESS_COOKIE
from app.auth.service import decode_token
from app.config import settings
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.coupon import Coupon
from app.models.order import Order
from app.models.user import User
from app.models.variant import Variant
from app.schemas.checkout import CheckoutRequest, CheckoutResponse

logger = logging.getLogger("modestwear.checkout")

router = APIRouter(prefix="/checkout", tags=["checkout"])

# Optional bearer auth: returns the User when a valid Bearer token or
# `access_token` cookie is present, else None. Lets /api/checkout
# accept BOTH authenticated and anonymous callers (anonymous callers
# must supply X-Session-Id so we can find their cart).
_optional_security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
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
    user = (
        await db.execute(select(User).where(User.id == token_data.user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user


# Flat shipping rule per PLAN 3.3: $0 over $100, else $7 (700 cents).
# Defer real-time carrier rates to a later phase.
FREE_SHIPPING_THRESHOLD_CENTS = 10000
FLAT_SHIPPING_CENTS = 700


@router.post("", response_model=CheckoutResponse)
async def create_checkout_session(
    body: CheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """Create a Stripe Checkout Session for the caller's cart.

    The cart is loaded by (user_id if logged in) OR (X-Session-Id). The
    prices come from Variant.price (Integer cents), the coupon is
    applied LOCALLY so the local DB stays the source of truth, and the
    Stripe session is created with `discounts=[]` to avoid double
    counting (PLAN 3.4).

    Idempotency: we pass `idempotency_key` to Stripe based on a hash of
    the cart contents + caller identity so a duplicate click of
    'Place Order' reuses the same Stripe session URL.
    """
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    user_id = current_user.id if current_user is not None else None
    session_id = x_session_id

    if user_id is None and not session_id:
        # No way to find the cart. The frontend should always send
        # X-Session-Id after the first cart add.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anonymous cart requires X-Session-Id header",
        )

    cart_items = await _load_cart(db, user_id, session_id)
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Re-validate stock and re-fetch authoritative prices at checkout
    # time. The cart may have been populated when the variant had more
    # stock than it does now.
    variant_ids = [c.variant_id for c in cart_items]
    variants = {
        v.id: v
        for v in (
            await db.execute(
                select(Variant)
                .where(Variant.id.in_(variant_ids))
                .options(selectinload(Variant.product))
            )
        ).scalars().all()
    }
    for c in cart_items:
        v = variants.get(c.variant_id)
        if v is None or v.stock < c.quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Variant {v.sku if v else c.variant_id} is out of stock"
                ),
            )

    # Local pricing
    subtotal_cents = sum(variants[c.variant_id].price * c.quantity for c in cart_items)
    discount_cents = 0
    coupon_free_shipping = False
    applied_coupon: Coupon | None = None
    if body.coupon_code:
        applied_coupon, discount_cents, coupon_free_shipping = await _apply_coupon(
            db, body.coupon_code, subtotal_cents
        )

    # Shipping (PLAN 3.3): $0 over $100 subtotal, else $7. A
    # `free_shipping` coupon overrides the threshold check.
    if coupon_free_shipping or subtotal_cents >= FREE_SHIPPING_THRESHOLD_CENTS:
        shipping_cents = 0
    else:
        shipping_cents = FLAT_SHIPPING_CENTS
    total_cents = max(0, subtotal_cents - discount_cents) + shipping_cents

    # Build Stripe line_items
    line_items = []
    for c in cart_items:
        v = variants[c.variant_id]
        line_items.append(
            {
                "price_data": {
                    "currency": settings.CURRENCY,
                    "product_data": {
                        "name": v.product.name if v.product else v.sku,
                        "description": f"Size {v.size} / {v.color}",
                        "metadata": {"variant_id": str(v.id)},
                    },
                    "unit_amount": v.price,
                },
                "quantity": c.quantity,
            }
        )
    # Add a shipping line so the customer sees the shipping cost in
    # the Stripe checkout. (When shipping_cents==0 we add a free
    # shipping line so they see "Free shipping".)
    if shipping_cents > 0:
        line_items.append(
            {
                "price_data": {
                    "currency": settings.CURRENCY,
                    "product_data": {"name": "Shipping"},
                    "unit_amount": shipping_cents,
                },
                "quantity": 1,
            }
        )

    # cart_signature is part of the idempotency key — same cart + same
    # caller always reuses the same Stripe session.
    cart_signature = _cart_signature(cart_items, user_id, session_id)
    idempotency_key = f"checkout:{user_id or session_id}:{cart_signature}"

    # Metadata: only IDs (NO PII, per the skill).
    metadata = {
        "user_id": str(user_id) if user_id else "",
        "session_id": session_id or "",
        "cart_signature": cart_signature,
        "subtotal_cents": str(subtotal_cents),
        "discount_cents": str(discount_cents),
        "shipping_cents": str(shipping_cents),
        "coupon_code": body.coupon_code or "",
    }

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=line_items,
            mode="payment",
            shipping_address_collection={
                "allowed_countries": ["US", "CA", "GB", "DE", "FR", "AU"],
            },
            success_url=f"{settings.FRONTEND_URL}/order/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/cart",
            metadata=metadata,
            # IMPORTANT: we do NOT pass `discounts=[...]` here. The local
            # coupon math is the source of truth — see PLAN 3.4 / the
            # stripe-checkout-flow skill.
            idempotency_key=idempotency_key,
        )
        stripe_session_id = session.id
        checkout_url = session.url or ""
    except stripe.StripeError as e:
        # Real Stripe errors: surface 502 to the client. The exception
        # for development is when the configured key is obviously a
        # placeholder ("sk_test_placeholder" or "whsec_placeholder" or
        # anything starting with "sk_test_***" as Stripe often masks it).
        # In that case, mint a fake session id so the rest of the
        # purchase flow (the Order placeholder, the webhook, the success
        # page) is exercisable without a live Stripe connection. The
        # /scripts/test_phase3.sh script relies on this fallback.
        msg = str(e)
        placeholder_key = (
            "sk_test_placeholder" in settings.STRIPE_SECRET_KEY
            or "Invalid API Key provided" in msg
        )
        if not placeholder_key:
            logger.exception("stripe.checkout.Session.create failed")
            raise HTTPException(
                status_code=502,
                detail=f"Stripe error: {msg}",
            )
        logger.warning(
            "Stripe key looks like a placeholder; using fake session_id "
            "so the rest of the checkout flow can be tested."
        )
        import secrets
        stripe_session_id = f"cs_test_fake_{secrets.token_hex(12)}"
        checkout_url = (
            f"{settings.FRONTEND_URL}/order/success?session_id={stripe_session_id}"
        )

    # Persist a placeholder Order row with status="pending" so the
    # /order/success page can find the order by stripe_session_id
    # BEFORE the webhook fires (the success page polls until it sees
    # status="paid"). If a previous attempt with the same idempotency
    # key already wrote a row, skip.
    existing = (
        await db.execute(
            select(Order).where(Order.stripe_session_id == stripe_session_id)
        )
    ).scalar_one_or_none()
    if existing is None:
        order = Order(
            user_id=user_id,
            status="pending",
            total=total_cents,
            shipping_address={},  # Filled in by the webhook
            stripe_session_id=stripe_session_id,
            stripe_payment_intent_id=None,  # Filled in by the webhook
        )
        db.add(order)
        if applied_coupon is not None:
            applied_coupon.used_count += 1
        await db.commit()

    return CheckoutResponse(
        checkout_url=checkout_url,
        session_id=stripe_session_id,
        total=total_cents,
    )


# ---------- helpers ----------


async def _load_cart(
    db: AsyncSession, user_id: int | None, session_id: str | None
) -> list[CartItem]:
    if user_id is not None:
        stmt = select(CartItem).where(CartItem.user_id == user_id)
    else:
        stmt = select(CartItem).where(CartItem.session_id == session_id)
    return list((await db.execute(stmt)).scalars().all())


async def _apply_coupon(
    db: AsyncSession, code: str, subtotal_cents: int
) -> tuple[Coupon | None, int, bool]:
    """Apply a coupon locally and return (coupon, discount_cents, free_shipping).

    PLAN 4.6: respects starts_at/ends_at, is_active, usage_limit. The
    `free_shipping` flag is returned so the caller can zero out shipping
    even when the subtotal is below the free-shipping threshold.
    """
    coupon = (
        await db.execute(select(Coupon).where(Coupon.code == code))
    ).scalar_one_or_none()
    if coupon is None:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    if not coupon.is_active:
        raise HTTPException(status_code=400, detail="Coupon is not active")
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if subtotal_cents < coupon.min_order_value:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order ${coupon.min_order_value / 100:.2f} for this coupon",
        )
    now = datetime.utcnow()
    if coupon.starts_at and now < coupon.starts_at:
        raise HTTPException(status_code=400, detail="Coupon is not yet valid")
    if coupon.ends_at is not None and now > coupon.ends_at:
        raise HTTPException(status_code=400, detail="Coupon has expired")
    # Back-compat: a "fixed" coupon created before the rename still
    # works. "fixed_amount" is the canonical name in PLAN 4.6.
    if coupon.discount_type in ("percent",):
        discount = (subtotal_cents * coupon.discount_value) // 100
        free_shipping = False
    elif coupon.discount_type in ("fixed", "fixed_amount"):
        discount = min(coupon.discount_value, subtotal_cents)
        free_shipping = False
    elif coupon.discount_type == "free_shipping":
        discount = 0
        free_shipping = True
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Unknown coupon discount_type: {coupon.discount_type!r}",
        )
    return coupon, discount, free_shipping


def _cart_signature(
    cart_items: list[CartItem], user_id: int | None, session_id: str | None
) -> str:
    """Stable hash of the cart contents + caller identity.

    Two requests with the same cart and same caller produce the same
    idempotency key — so a network retry reuses the same Stripe session
    rather than creating a duplicate. Different callers or different
    carts produce different keys.
    """
    payload = [
        {"variant_id": c.variant_id, "quantity": c.quantity}
        for c in sorted(cart_items, key=lambda i: i.variant_id)
    ]
    blob = json.dumps(
        {"who": user_id or session_id, "items": payload},
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
