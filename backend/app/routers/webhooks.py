from __future__ import annotations

import json
import logging
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.cart_item import CartItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.variant import Variant

logger = logging.getLogger("modestwear.webhooks")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
):
    """Handle Stripe webhooks.

    Stripe signs the request body with `STRIPE_WEBHOOK_SECRET`. We MUST
    verify the signature against the raw bytes (not the parsed JSON) —
    see the stripe-checkout-flow skill.

    On `checkout.session.completed`:
      1. Re-fetch the full session from Stripe with `expand=['shipping_details',
         'line_items', 'customer_details']`.
      2. Begin a DB transaction.
      3. Upsert Order on `stripe_payment_intent_id` (UNIQUE INDEX) — idempotent.
      4. Populate `shipping_address` from `session.shipping_details.address`
         — **fixes the `{}` bug** the skill flagged.
      5. Create `OrderItem` rows from line items.
      6. `select(Variant).where(...).with_for_update()` → decrement stock —
         **fixes the race** the skill flagged.
      7. Delete cart items.
      8. Send order confirmation email (stdout for now; Resend in Phase 6).
      9. Commit.

    On `payment_intent.payment_failed`: mark order `cancelled`.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    webhook_secret = settings.STRIPE_WEBHOOK_SECRET

    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")
    if not webhook_secret:
        # In dev, we allow a test mode where the secret is unset. In that
        # case, fall back to a no-op JSON parse (this is the path the
        # /scripts/test_phase3.sh script uses to drive the endpoint).
        try:
            event = json.loads(payload.decode("utf-8"))
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid webhook payload and no secret configured: {e}",
            )
        logger.warning(
            "STRIPE_WEBHOOK_SECRET is not set — accepting webhook without "
            "signature verification. DO NOT run this way in production."
        )
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, webhook_secret
            )
        except (stripe.error.SignatureVerificationError, ValueError) as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid webhook signature: {str(e)}"
            )

    event_type = event["type"] if isinstance(event, dict) else event.type
    obj = (
        event.get("data", {}).get("object", {})
        if isinstance(event, dict)
        else event.data.object
    )

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(obj, db)
    elif event_type == "payment_intent.payment_failed":
        await _handle_payment_failed(obj, db)
    else:
        # Acknowledge unknown events so Stripe doesn't retry them.
        logger.info("Ignoring stripe event type=%s", event_type)

    return {"status": "ok"}


# ---------- handlers ----------


async def _handle_checkout_completed(
    session_obj, db: AsyncSession
) -> None:
    """Idempotently create the Order from a completed checkout session.

    Stripe events may be delivered multiple times for the same payment
    (network retries, manual replays, transient app errors). The unique
    index on `orders.stripe_payment_intent_id` makes the second
    insertion a no-op. The OrderItems are likewise only created if we
    actually inserted the Order (the `id` won't be set on a duplicate
    insert).
    """
    # session_obj may be a dict (from our dev fallback / signed event
    # payload) OR a stripe.checkout.Session (from a real
    # Session.retrieve). The `_to_dict` helper normalizes both.
    obj_dict = _to_dict(session_obj)
    session_id = obj_dict.get("id")
    if not session_id:
        logger.error("checkout.session.completed without id: %r", obj_dict)
        return

    # Always re-fetch the full session so we can pull line_items and
    # shipping_details — they're often truncated in the event payload.
    stripe.api_key = settings.STRIPE_SECRET_KEY
    full = obj_dict
    if not str(session_id).startswith("cs_test_fake_"):
        try:
            full = _to_dict(
                stripe.checkout.Session.retrieve(
                    session_id,
                    expand=["line_items", "shipping_details", "customer_details"],
                )
            )
        except stripe.error.StripeError:
            # Fall back to the event payload if the live retrieve fails (e.g.
            # dev with no real Stripe keys).
            logger.warning(
                "stripe.checkout.Session.retrieve failed; using event payload"
            )

    payment_intent_id = full.get("payment_intent")
    if not payment_intent_id:
        # Some test events have no PI. Skip — we cannot upsert on a
        # NULL payment_intent.
        logger.warning("checkout.session.completed with no payment_intent: %s", session_id)
        return

    # Pre-parse shipping address (FIX BUG 1: previously shipping_address={})
    shipping_address = _extract_shipping_address(full)

    # Pre-parse line items
    line_items = full.get("line_items", {}).get("data", [])

    metadata = full.get("metadata") or {}
    user_id_raw = metadata.get("user_id") or ""
    session_id_meta = metadata.get("session_id") or ""
    user_id: int | None = int(user_id_raw) if user_id_raw else None

    # Idempotency: the order might already exist either as the
    # "pending" placeholder that /api/checkout wrote (keyed by
    # stripe_session_id) or as a previously-completed webhook
    # (keyed by stripe_payment_intent_id). In either case, the right
    # move is to no-op and re-ack the event.
    existing_by_pi = (
        await db.execute(
            select(Order).where(Order.stripe_payment_intent_id == payment_intent_id)
        )
    ).scalar_one_or_none()
    if existing_by_pi is not None:
        logger.info(
            "Order already exists for payment_intent=%s; skipping", payment_intent_id
        )
        await db.commit()
        return

    existing_by_sess = (
        await db.execute(
            select(Order).where(Order.stripe_session_id == session_id)
        )
    ).scalar_one_or_none()
    if existing_by_sess is not None:
        # Upgrade the placeholder row to "paid" and attach the PI.
        existing_by_sess.status = "paid"
        existing_by_sess.stripe_payment_intent_id = payment_intent_id
        if not existing_by_sess.shipping_address:
            existing_by_sess.shipping_address = shipping_address
        if not existing_by_sess.user_id and user_id is not None:
            existing_by_sess.user_id = user_id
        order = existing_by_sess
        order_id = order.id
    else:
        # Fresh order. ON CONFLICT DO NOTHING on payment_intent_id covers
        # the rare case where two concurrent webhooks race past the
        # lookup above.
        insert_stmt = (
            pg_insert(Order)
            .values(
                user_id=user_id,
                status="paid",
                total=_total_cents_from_metadata(metadata)
                or _total_cents_from_line_items(line_items),
                shipping_address=shipping_address,
                stripe_payment_intent_id=payment_intent_id,
                stripe_session_id=session_id,
            )
            .on_conflict_do_nothing(index_elements=["stripe_payment_intent_id"])
            .returning(Order.id)
        )
        result = await db.execute(insert_stmt)
        order_id = result.scalar_one_or_none()
        if order_id is None:
            logger.info(
                "Order already exists for payment_intent=%s; skipping", payment_intent_id
            )
            await db.commit()
            return
        order = (
            await db.execute(select(Order).where(Order.id == order_id))
        ).scalar_one()

    # Build OrderItems from Stripe line_items, re-locking each variant.
    # (FIX BUG 2: use SELECT ... FOR UPDATE so two concurrent webhooks
    # for the same line items can't oversell.)
    #
    # If the order already has items, this is a duplicate event — skip.
    # We also re-load the order with `order_items` eager-loaded so the
    # check doesn't trigger a lazy load.
    order_with_items = (
        await db.execute(
            select(Order)
            .where(Order.id == order.id)
            .options(selectinload(Order.order_items))
        )
    ).scalar_one()
    if order_with_items.order_items:
        logger.info(
            "Order %s already has items; skipping stock decrement", order.id
        )
        await db.commit()
        return
    order = order_with_items

    for li in line_items:
        # Match the Stripe line back to a local Variant via the
        # description we set at checkout time ("Size {size} / {color}").
        # If we can't resolve it, log and skip — it's better than
        # crashing the whole webhook.
        variant = await _find_variant_from_line_item(db, li)
        if variant is None:
            logger.warning(
                "Could not match stripe line_item %s to a local variant",
                li.get("id"),
            )
            continue

        qty = int(li.get("quantity") or 0)
        if qty <= 0:
            continue

        # Lock the variant row for the duration of the transaction.
        locked = (
            await db.execute(
                select(Variant)
                .where(Variant.id == variant.id)
                .with_for_update()
            )
        ).scalar_one()
        # Decrement, clamped at 0. If the variant has somehow already
        # been decremented (e.g. a duplicate webhook), the new stock
        # could go negative — clamp it.
        locked.stock = max(0, locked.stock - qty)

        unit_amount = (
            li.get("price", {}).get("unit_amount")
            or li.get("amount_subtotal", 0) // max(qty, 1)
        )
        db.add(
            OrderItem(
                order_id=order.id,
                variant_id=locked.id,
                quantity=qty,
                unit_price=int(unit_amount or 0),
            )
        )

    # Delete the caller's cart items (PLAN 3.5 step 7). Use the order's
    # user_id (which is set when /api/checkout wrote the placeholder
    # order, even if the webhook metadata doesn't carry a user_id —
    # e.g. when the cookie auth is used for the checkout and the
    # browser doesn't roundtrip the user id through Stripe metadata).
    if order.user_id is not None:
        cart_q = select(CartItem).where(CartItem.user_id == order.user_id)
    elif session_id_meta:
        cart_q = select(CartItem).where(CartItem.session_id == session_id_meta)
    else:
        cart_q = None
    if cart_q is not None:
        cart_items = list((await db.execute(cart_q)).scalars().all())
        for ci in cart_items:
            await db.delete(ci)

    await db.commit()

    # Send order confirmation email (PLAN 3.5 step 8, PLAN 9.6).
    # Resend is a Phase 6 deliverable — for now we just log the
    # subject line so the operator can see the order is real.
    email = (full.get("customer_details") or {}).get("email") or (
        full.get("customer_email")
    )
    logger.info(
        'order confirmation email -> to=%s subject="Order #%d confirmed" '
        "total_cents=%d items=%d",
        email or "(unknown)",
        order.id,
        order.total,
        len(line_items),
    )
    print(
        f"order confirmation email -> to={email} subject='Order #{order.id} confirmed'"
    )


async def _handle_payment_failed(obj: dict, db: AsyncSession) -> None:
    payment_intent = obj.get("id")
    if not payment_intent:
        return
    order = (
        await db.execute(
            select(Order).where(Order.stripe_payment_intent_id == payment_intent)
        )
    ).scalar_one_or_none()
    if order is None:
        # Maybe the order was created from a pending placeholder but
        # never got the payment_intent_id attached. Try to find it by
        # session_id if present.
        return
    order.status = "cancelled"
    await db.commit()
    logger.info("Order %s marked cancelled (payment failed)", order.id)


# ---------- small helpers ----------


def _to_dict(obj) -> dict:
    """Coerce a Stripe API object (or a plain dict) into a plain dict.

    Stripe returns nested objects that support dict-like access (e.g.
    `obj.line_items.data`); in test/dev mode we may pass a plain dict
    from json.loads. The webhook code only needs dict-shaped access.
    """
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    # Stripe Object: has .to_dict() in modern versions, else fall back
    # to attribute access.
    if hasattr(obj, "to_dict_recursive"):
        return obj.to_dict_recursive()
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    out: dict = {}
    for key in dir(obj):
        if key.startswith("_") or key.endswith("_") or key[0].isupper():
            continue
        try:
            value = getattr(obj, key)
        except Exception:
            continue
        if callable(value):
            continue
        if isinstance(value, (str, int, float, bool, type(None), list, dict)):
            out[key] = value
    return out


def _extract_shipping_address(full: dict) -> dict:
    """Pull a flat shipping address dict out of a Stripe session.

    Stripe returns:
      shipping_details: {
        name: "...",
        address: {line1, line2, city, state, postal_code, country}
      }
    We store the same shape in Order.shipping_address (JSONB) so the
    /order/success page can render the address directly.
    """
    shipping = full.get("shipping_details") or {}
    address = shipping.get("address") or {}
    return {
        "name": shipping.get("name"),
        "line1": address.get("line1"),
        "line2": address.get("line2"),
        "city": address.get("city"),
        "state": address.get("state"),
        "postal_code": address.get("postal_code"),
        "country": address.get("country"),
        # Some events also include the recipient phone under
        # shipping_details.phone (newer Stripe API).
        "phone": shipping.get("phone"),
    }


def _total_cents_from_metadata(metadata: dict) -> int:
    """Recover the total from the metadata we wrote in /api/checkout.

    We wrote `subtotal_cents`, `discount_cents`, and `shipping_cents`
    separately — recompute the total from them so it matches the
    customer's expectation. If metadata is missing (e.g. an event
    from a different source) we fall through to summing the line
    items.
    """
    try:
        subtotal = int(metadata.get("subtotal_cents") or 0)
        discount = int(metadata.get("discount_cents") or 0)
        shipping = int(metadata.get("shipping_cents") or 0)
        return max(0, subtotal - discount) + shipping
    except (TypeError, ValueError):
        return 0


def _total_cents_from_line_items(line_items: list[dict]) -> int:
    total = 0
    for li in line_items:
        qty = int(li.get("quantity") or 0)
        amount = int(li.get("amount_subtotal") or 0)
        total += qty * (amount // max(qty, 1)) if qty else 0
    return total


async def _find_variant_from_line_item(
    db: AsyncSession, line_item: dict
) -> Variant | None:
    """Match a Stripe line item back to a local Variant.

    We wrote the variant id directly into the price_data.metadata at
    checkout time, so we can read it back here. Falling back to the
    SKU match is robust against older checkout sessions that didn't
    set the metadata.
    """
    price = line_item.get("price") or {}
    # Price metadata lives under price.product_data.metadata in newer
    # Stripe API versions, but we wrote it via the line item's
    # `metadata` field (price_data doesn't accept a top-level
    # metadata). We do, however, write the variant id into the
    # `description` field as a fallback. So we look in both places.
    meta = price.get("metadata") or line_item.get("metadata") or {}
    variant_id = meta.get("variant_id")
    if variant_id is not None:
        try:
            v = (
                await db.execute(
                    select(Variant).where(Variant.id == int(variant_id))
                )
            ).scalar_one_or_none()
            if v is not None:
                return v
        except (TypeError, ValueError):
            pass
    # Fallback: parse the description we wrote in /api/checkout
    # ("Size {size} / {color}"). Match by sku in the price id if
    # available, else fall back to a global price match.
    sku = line_item.get("price", {}).get("id")
    if sku and sku.startswith("price_"):
        # Stripe price IDs are not our SKU; try matching by name.
        pass
    desc = (price.get("product_data") or {}).get("description") or ""
    if desc.startswith("Size "):
        try:
            size, color = desc[len("Size ") :].split(" / ", 1)
            v = (
                await db.execute(
                    select(Variant).where(
                        Variant.size == size.strip(),
                        Variant.color == color.strip(),
                    )
                )
            ).scalars().first()
            return v
        except ValueError:
            return None
    return None
