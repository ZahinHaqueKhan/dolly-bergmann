#!/usr/bin/env bash
# scripts/test_phase3.sh
#
# End-to-end test for Phase 3 (cart, checkout, webhook, order persistence,
# stock decrement, idempotency). Designed to run against a backend started
# with:
#
#   STRIPE_SECRET_KEY=sk_test_placeholder \
#   STRIPE_WEBHOOK_SECRET=whsec_test_placeholder \
#   FRONTEND_URL=http://localhost:3000 \
#   venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
#
# Run from the repo root:
#
#   bash scripts/test_phase3.sh
#
# Exits 0 on success, non-zero on first failure. Uses only bash + curl +
# python3 (no jq required). Does not touch the cart store in the
# frontend — talks directly to the FastAPI backend, like the other
# scripts in the suite.

set -euo pipefail

API="${API:-http://127.0.0.1:8000}"
TS="$(date +%s)"
TEST_EMAIL="phase3-${TS}@example.com"
TEST_PASSWORD="Phase3Test!"
SESS="phase3-sess-${TS}"
COOKIES="$(mktemp)"
trap "rm -f '$COOKIES'" EXIT

# Pretty output
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
section() { bold ""; bold "== $* =="; }

# Get a stock value from the DB via psql (the script's test_data layer).
get_stock() {
  psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
    -t -A -c "SELECT stock FROM variants WHERE id=$1;" | tr -d ' '
}

section "Pre-flight"

# Verify the backend is reachable.
if ! curl -fsS "$API/health" >/dev/null; then
  fail "Backend not reachable at $API — start it with: cd backend && venv/bin/uvicorn app.main:app --port 8000"
fi
ok "Backend is up at $API"

# Get a product to test with. Use product id 9 (Classic Denim Jacket)
# which has variants 37-40.
PRODUCT_ID=9
VARIANT_ID=37
INITIAL_STOCK="$(get_stock $VARIANT_ID)"
if [ -z "$INITIAL_STOCK" ] || [ "$INITIAL_STOCK" = "0" ]; then
  fail "Variant $VARIANT_ID has no stock. Run backend/scripts/seed.py first."
fi
ok "Variant $VARIANT_ID has $INITIAL_STOCK in stock"

section "Auth: register"

REGISTER_RESP="$(curl -fsS -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -c "$COOKIES" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"first_name\":\"Phase3\",\"last_name\":\"Tester\"}")"
echo "$REGISTER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('access_token'), 'no access_token'" >/dev/null \
  || fail "register did not return an access_token"
ok "registered $TEST_EMAIL"

# /me should return 200 with the cookie
ME_STATUS="$(curl -fsS -o /dev/null -w '%{http_code}' "$API/api/auth/me" -b "$COOKIES")"
[ "$ME_STATUS" = "200" ] || fail "/me expected 200, got $ME_STATUS"
ok "/me works (200)"

section "Cart: add items as guest then merge into user cart on login"

# Use a separate session for the guest cart.
GUEST_SESS="phase3-guest-${TS}"
GUANTITY=2

curl -fsS -X POST "$API/api/cart/items" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $GUEST_SESS" \
  -d "{\"variant_id\":$VARIANT_ID,\"quantity\":$GUANTITY}" >/dev/null \
  || fail "POST /api/cart/items (guest) failed"
ok "added qty=$GUANTITY of variant $VARIANT_ID to guest cart"

# Switch to the registered user. Send both the auth cookie AND the old
# session id so the merge runs.
curl -fsS -X POST "$API/api/cart/items" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $GUEST_SESS" \
  -b "$COOKIES" \
  -d "{\"variant_id\":$VARIANT_ID,\"quantity\":1}" >/dev/null \
  || fail "POST /api/cart/items (user, triggering merge) failed"
ok "merge ran: user now owns the guest cart"

# Verify the user cart has the right items. The merge picks the larger
# of (user_quantity=1, guest_quantity=2) = 2 for the v37 line.
USER_CART="$(curl -fsS "$API/api/cart" -b "$COOKIES")"
TOTAL_QTY="$(echo "$USER_CART" | python3 -c "import sys,json; print(json.load(sys.stdin)['item_count'])")"
[ "$TOTAL_QTY" = "2" ] || fail "expected item_count=2 after merge, got $TOTAL_QTY (got: $USER_CART)"
LINE_COUNT="$(echo "$USER_CART" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")"
[ "$LINE_COUNT" = "1" ] || fail "expected 1 line in cart after merge, got $LINE_COUNT"
ok "user cart has 1 line of variant $VARIANT_ID with qty=2 (the merge picked the larger quantity)"

# Stock should still be unchanged.
[ "$(get_stock $VARIANT_ID)" = "$INITIAL_STOCK" ] || fail "stock changed during cart ops"
ok "stock unchanged at $INITIAL_STOCK after cart ops"

section "Cart: stock validation"

# Try to add a quantity that would exceed stock.
HUGE_QTY=99999
HTTP_CODE="$(curl -sS -o /tmp/oversell.json -w '%{http_code}' -X POST "$API/api/cart/items" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"variant_id\":$VARIANT_ID,\"quantity\":$HUGE_QTY}")"
[ "$HTTP_CODE" = "400" ] || fail "expected 400 when adding huge qty, got $HTTP_CODE"
ok "rejected oversized add with 400"

section "Checkout: /api/checkout returns a session_id (not 500)"

CHECKOUT_RESP="$(curl -sS -o /tmp/checkout.json -w '%{http_code}' -X POST "$API/api/checkout" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d '{
    "shipping_address": {
      "name": "Phase3 Tester",
      "line1": "1 Main St",
      "city": "Boston",
      "state": "MA",
      "postal_code": "02101",
      "country": "US"
    }
  }')"
# With a placeholder Stripe key, the response is 502 (Stripe rejects the
# key) OR 200 (placeholder-fallback path returns a fake session id).
# Both are acceptable — what we DON'T want is 500 (server crash).
[ "$CHECKOUT_RESP" = "200" ] || [ "$CHECKOUT_RESP" = "502" ] \
  || fail "checkout expected 200 or 502, got $CHECKOUT_RESP: $(cat /tmp/checkout.json)"
ok "checkout responded $CHECKOUT_RESP (no 500)"

# If we got 200, a placeholder Order row was created. Extract the
# session id; otherwise, we have to seed one manually for the webhook
# test.
if [ "$CHECKOUT_RESP" = "200" ]; then
  SESSION_ID="$(python3 -c "import json; print(json.load(open('/tmp/checkout.json'))['session_id'])")"
  ok "got session_id=$SESSION_ID"
else
  # Manually create a placeholder Order for the webhook to upgrade. This
  # mirrors what /api/checkout would have done in production.
  SESSION_ID="cs_test_fake_${TS}_${RANDOM}"
  psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
    -c "INSERT INTO orders (user_id, status, total, shipping_address, stripe_session_id, created_at, updated_at) \
        VALUES ((SELECT id FROM users WHERE email='$TEST_EMAIL'), 'pending', 17800, '{}'::jsonb, '$SESSION_ID', NOW(), NOW());" \
    >/dev/null
  ok "manually seeded a pending Order with stripe_session_id=$SESSION_ID (Stripe call was 502)"
fi

section "Webhook: /api/webhooks/stripe (with valid signature)"

PI_ID="pi_test_${TS}_${RANDOM}"
EVT_ID="evt_test_${TS}_${RANDOM}"

# Build the payload via Python so we don't have to fight bash escaping.
# We use a temp .py file rather than a heredoc so that `set -euo pipefail`
# + the bash version on this machine doesn't truncate the body (the
# heredoc redirect + `set -u` interacts badly when the heredoc body
# contains unescaped chars like `{` / `}` / `None`).
cat > /tmp/build_payload.py <<PYEOF
import json
print(json.dumps({
  "id": "$EVT_ID",
  "object": "event",
  "type": "checkout.session.completed",
  "data": {"object": {
    "id": "$SESSION_ID",
    "object": "checkout.session",
    "payment_intent": "$PI_ID",
    "metadata": {
      "user_id": "",
      "session_id": "",
      "cart_signature": "fake",
      "subtotal_cents": "17800",
      "discount_cents": "0",
      "shipping_cents": "0",
      "coupon_code": ""
    },
    "shipping_details": {
      "name": "Phase3 Tester",
      "address": {
        "line1": "1 Main St", "line2": None, "city": "Boston",
        "state": "MA", "postal_code": "02101", "country": "US"
      }
    },
    "customer_details": {"email": "$TEST_EMAIL"},
    "line_items": {"data": [{
      "id": "li_1", "object": "item", "quantity": 2, "amount_subtotal": 17800,
      "price": {
        "id": "price_1", "object": "price",
        "metadata": {"variant_id": "$VARIANT_ID"},
        "product_data": {"name": "Classic Denim Jacket", "description": "Size S / Blue"}
      }
    }]}
  }}
}))
PYEOF
python3 /tmp/build_payload.py > /tmp/payload.json

# Sign with the same secret the backend is configured with.
WEBHOOK_TS="$(date +%s)"
cat > /tmp/sign.py <<PYEOF
import hmac, hashlib
secret = b'whsec_test_placeholder'
with open('/tmp/payload.json') as f: payload = f.read()
print(hmac.new(secret, f'$WEBHOOK_TS.{payload}'.encode(), hashlib.sha256).hexdigest())
PYEOF
WEBHOOK_SIG="$(python3 /tmp/sign.py)"

WH_RESP="$(curl -sS -o /tmp/webhook.json -w '%{http_code}' -X POST "$API/api/webhooks/stripe" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=$WEBHOOK_TS,v1=$WEBHOOK_SIG" \
  --data-binary @/tmp/payload.json)"
[ "$WH_RESP" = "200" ] || fail "webhook expected 200, got $WH_RESP: $(cat /tmp/webhook.json)"
ok "webhook accepted (200)"

section "Verify: Order created, stock decremented, idempotency"

# Order should be paid with the right total + address + PI.
ORDER_ROW="$(psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
  -t -A -c "SELECT status || '|' || total || '|' || COALESCE(shipping_address->>'line1', '') || '|' || stripe_payment_intent_id \
            FROM orders WHERE stripe_session_id='$SESSION_ID';")"
[ -n "$ORDER_ROW" ] || fail "no Order row found for stripe_session_id=$SESSION_ID"
ORDER_STATUS="$(echo "$ORDER_ROW" | cut -d'|' -f1)"
ORDER_TOTAL="$(echo "$ORDER_ROW" | cut -d'|' -f2)"
ORDER_LINE1="$(echo "$ORDER_ROW" | cut -d'|' -f3)"
ORDER_PI="$(echo "$ORDER_ROW" | cut -d'|' -f4)"
[ "$ORDER_STATUS" = "paid" ] || fail "expected Order.status=paid, got $ORDER_STATUS"
[ "$ORDER_TOTAL" = "17800" ] || fail "expected Order.total=17800 (2 x variant $VARIANT_ID = 2*8900), got $ORDER_TOTAL"
[ "$ORDER_LINE1" = "1 Main St" ] || fail "expected shipping_address.line1='1 Main St' (fix bug 1), got '$ORDER_LINE1'"
[ "$ORDER_PI" = "$PI_ID" ] || fail "expected stripe_payment_intent_id=$PI_ID, got $ORDER_PI"
ok "Order: status=$ORDER_STATUS total=$ORDER_TOTAL line1='$ORDER_LINE1' pi=$ORDER_PI"

# OrderItem exists for the right variant.
ITEM_COUNT="$(psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
  -t -A -c "SELECT count(*) FROM order_items \
            WHERE order_id=(SELECT id FROM orders WHERE stripe_session_id='$SESSION_ID') \
              AND variant_id=$VARIANT_ID AND quantity=2;")"
[ "$ITEM_COUNT" = "1" ] || fail "expected 1 OrderItem (qty=2) for variant $VARIANT_ID, got $ITEM_COUNT"
ok "OrderItem exists for variant $VARIANT_ID"

# Stock should be decremented by exactly 2 (line_items says qty=2).
NEW_STOCK="$(get_stock $VARIANT_ID)"
EXPECTED_STOCK=$((INITIAL_STOCK - 2))
[ "$NEW_STOCK" = "$EXPECTED_STOCK" ] || fail "stock expected $EXPECTED_STOCK (was $INITIAL_STOCK - 2), got $NEW_STOCK"
ok "stock decremented: $INITIAL_STOCK -> $NEW_STOCK"

# Cart should be empty (the webhook deletes cart items for the user).
USER_CART_ITEMS="$(curl -fsS "$API/api/cart" -b "$COOKIES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")"
[ "$USER_CART_ITEMS" = "0" ] || fail "expected user cart empty after webhook, has $USER_CART_ITEMS items"
ok "user cart cleared by webhook"

# Replay the same webhook — must be idempotent.
WH_RESP2="$(curl -sS -o /tmp/webhook2.json -w '%{http_code}' -X POST "$API/api/webhooks/stripe" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=$WEBHOOK_TS,v1=$WEBHOOK_SIG" \
  --data-binary @/tmp/payload.json)"
[ "$WH_RESP2" = "200" ] || fail "webhook replay expected 200, got $WH_RESP2: $(cat /tmp/webhook2.json)"
NEW_STOCK2="$(get_stock $VARIANT_ID)"
[ "$NEW_STOCK2" = "$NEW_STOCK" ] || fail "stock changed on webhook replay: $NEW_STOCK -> $NEW_STOCK2 (idempotency broken)"
ITEM_COUNT2="$(psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
  -t -A -c "SELECT count(*) FROM order_items \
            WHERE order_id=(SELECT id FROM orders WHERE stripe_session_id='$SESSION_ID');")"
[ "$ITEM_COUNT2" = "1" ] || fail "duplicate OrderItem created on webhook replay: $ITEM_COUNT2 (expected 1)"
ok "webhook replay is idempotent: stock and OrderItem count unchanged"

section "Verify: /api/orders/by-stripe/{session_id} (success page lookup)"

BY_STRIPE="$(curl -fsS "$API/api/orders/by-stripe/$SESSION_ID" -b "$COOKIES")"
echo "$BY_STRIPE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'paid', d
assert d['stripe_session_id'] == '$SESSION_ID', d
assert d['shipping_address']['line1'] == '1 Main St', d
assert len(d['items']) == 1, d
" || fail "by-stripe endpoint returned unexpected data: $BY_STRIPE"
ok "by-stripe lookup returns the paid order with the right address"

section "Verify: anonymous /api/orders/by-stripe returns 403 for a user's order"

ANON_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "$API/api/orders/by-stripe/$SESSION_ID")"
[ "$ANON_STATUS" = "403" ] || fail "anonymous by-stripe expected 403, got $ANON_STATUS"
ok "anonymous lookup blocked (403)"

section "Verify: order status cancel restores stock"

ADMIN_COOKIES="$(mktemp)"
ADMIN_LOGIN="$(curl -sS -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" -c "$ADMIN_COOKIES" \
  -d '{"email":"admin@modestwear.com","password":"changeme"}')"
echo "$ADMIN_LOGIN" | python3 -c "import sys,json; assert json.load(sys.stdin).get('access_token')" \
  || fail "admin login failed: $ADMIN_LOGIN"
ok "admin logged in"

# Cancel the order, expect stock to come back.
NEW_STATUS="$(psql 'postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann' \
  -t -A -c "SELECT id FROM orders WHERE stripe_session_id='$SESSION_ID';")"
CANCEL_RESP="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
  "$API/api/orders/admin/$NEW_STATUS/status" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIES" \
  -d '{"status":"cancelled"}')"
[ "$CANCEL_RESP" = "200" ] || fail "cancel expected 200, got $CANCEL_RESP"
NEW_STOCK3="$(get_stock $VARIANT_ID)"
[ "$NEW_STOCK3" = "$INITIAL_STOCK" ] || fail "stock not restored after cancel: $NEW_STOCK3 (expected $INITIAL_STOCK)"
ok "stock restored on cancel: $NEW_STOCK2 -> $NEW_STOCK3"

rm -f "$ADMIN_COOKIES"

section "Done"

printf "\n  \033[1;32mAll Phase 3 tests passed.\033[0m\n\n"
printf "  Registered:    $TEST_EMAIL\n"
printf "  Order ID:      $NEW_STATUS\n"
printf "  Session ID:    $SESSION_ID\n"
printf "  Payment PI:    $PI_ID\n\n"
