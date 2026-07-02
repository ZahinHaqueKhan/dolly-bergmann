---
name: stripe-checkout-flow
description: Use when implementing, debugging, or modifying the Stripe Checkout + webhook payment flow in the ModestWear backend. Triggers on /api/checkout, /api/webhooks/stripe, Order creation, stock decrement, idempotency, or any payment-related concern.
---

# Stripe Checkout Flow Skill

## Overview
ModestWear uses **Stripe Checkout (hosted)**. The customer is redirected to Stripe; Stripe posts a webhook back to confirm payment. Currently `backend/app/routers/checkout.py` creates the session and `backend/app/routers/webhooks.py` handles `checkout.session.completed`, but several pieces of the contract are incomplete.

## When to use this skill
- Editing `backend/app/routers/checkout.py` or `webhooks.py`
- Adding new fields to the Order model
- Implementing order confirmation emails
- Debugging "Order not found" or duplicate-order issues
- Adding coupon, tax, or shipping cost logic

## Required end-to-end flow

```
1. Client: POST /api/checkout  {shipping_address, coupon_code?}
   ↓
2. Backend: load cart (user or session_id) → validate stock → compute total → apply coupon
   ↓
3. Backend: stripe.checkout.Session.create(...)
   - line_items: one per CartItem (price in cents, currency="usd")
   - shipping_address_collection (collect from customer on Stripe's page)
   - metadata: {user_id, session_id, cart_signature}
   - idempotency_key: hash(cart contents + user_id)  ← critical
   ↓
4. Backend: return {checkout_url, session_id}
   ↓
5. Client: redirect to checkout_url
   ↓
6. Stripe: charge card → POST /api/webhooks/stripe
   ↓
7. Backend: verify signature → stripe.checkout.Session.retrieve(id, expand=['line_items', 'customer'])
   ↓
8. Backend: upsert Order (idempotent on stripe_payment_intent_id) → create OrderItems → decrement Variant.stock → delete CartItems → send confirmation email
```

## Current bugs / gaps (must fix)

### Bug 1: `Order.shipping_address` is `{}` on creation
In `webhooks.py:60`, the Order is created with `shipping_address={}`. The shipping address lives on the Stripe Session object. Fix:

```python
shipping = session.get("shipping_details") or {}
address = shipping.get("address", {})
order = Order(
    user_id=...,
    status="paid",
    total=total,
    shipping_address={
        "name": shipping.get("name"),
        "line1": address.get("line1"),
        "line2": address.get("line2"),
        "city": address.get("city"),
        "state": address.get("state"),
        "postal_code": address.get("postal_code"),
        "country": address.get("country"),
    },
    stripe_payment_intent_id=payment_intent,
)
```

### Bug 2: stock decrement is not atomic
The current code does `cart_item.variant.stock -= cart_item.quantity` inside the same session but without `SELECT ... FOR UPDATE`. Two concurrent webhooks can both pass the stock check and oversell. Fix with `with_for_update()`:

```python
stmt = select(Variant).where(Variant.id == cart_item.variant_id).with_for_update()
```

### Bug 3: no idempotency on webhook
Stripe **will** retry webhooks. The current `if order is None` / `else: order.status = "paid"` pattern is correct but fragile. Always key off `stripe_payment_intent_id` (unique) and use a DB-level upsert or `INSERT ... ON CONFLICT DO NOTHING`.

## Required idempotency key

Generate on session creation, store in `Order.stripe_payment_intent_id` AND pass to `stripe.checkout.Session.create(..., idempotency_key=...)`:

```python
import hashlib, json
cart_sig = hashlib.sha256(
    json.dumps([(c.variant_id, c.quantity) for c in cart_items], sort_keys=True).encode()
).hexdigest()
idempotency_key = f"{user_id or session_id}:{cart_sig}"
```

## Webhook signature verification

The current code is correct but assumes `STRIPE_WEBHOOK_SECRET` is set. If unset (dev), webhooks will fail. Pattern:

```python
if not webhook_secret:
    raise HTTPException(status_code=500, detail="Webhook secret not configured")

payload = await request.body()  # raw bytes, NOT request.json()
event = stripe.Webhook.construct_event(payload, stripe_signature, webhook_secret)
```

**For local dev**, use the Stripe CLI: `stripe listen --forward-to localhost:8000/api/webhooks/stripe`. Never disable signature verification.

## Coupon handling

The `discounts=[{"coupon": {"code": ...}}]` parameter in `checkout.py:110` is correct for Stripe-managed coupons. However, the **local discount math** at lines 92–97 (`total -= discount`) is wrong if `discounts=[...]` is also passed — Stripe will apply it again. Pick one source of truth: either let Stripe handle it (recommended) and remove the local math, or skip `discounts=[...]` and apply locally. Document the choice.

## Currency

Hardcoded `"usd"` in `checkout.py:64`. The plan mentions multi-currency as an open question. For now, leave as-is but extract to `settings.CURRENCY` so it's a one-line change later.

## Testing without real charges

Use Stripe test mode keys. Test card: `4242 4242 4242 4242`, any future date, any CVC. The webhook in test mode fires automatically when using `stripe trigger checkout.session.completed`.

## Order confirmation email

Not implemented. The plan calls for "Email + on-screen confirmation with order summary." Add a background task (FastAPI `BackgroundTasks`) to send via Resend / SES / SendGrid after order is created. See `plan.md §9.6`.

## Security checklist

- [ ] `STRIPE_WEBHOOK_SECRET` is set and used for every webhook call
- [ ] Webhook endpoint is **outside** any rate limiter
- [ ] Webhook endpoint does not require auth (Stripe signs for it)
- [ ] `Order.stripe_payment_intent_id` has a unique index
- [ ] Cart is re-validated on webhook, not just on session creation
- [ ] Stock decrement uses `with_for_update()`
- [ ] No PII in Stripe `metadata` (only IDs)
