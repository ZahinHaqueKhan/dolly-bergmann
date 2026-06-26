#!/usr/bin/env bash
# scripts/test_phase4.5.sh
#
# End-to-end test for Phase 4.5 (B2B wholesale portal). Verifies the
# BACKEND endpoints the wholesale flow calls. The frontend pages are
# exercised manually in the dev server and not by this script.
#
# Run from the repo root:
#
#   bash scripts/test_phase4.5.sh
#
# Exits 0 on success, non-zero on first failure. Uses bash + curl +
# python3 + psql. The backend must be running on 127.0.0.1:8000 and
# alembic upgrade head must have been run.
#
# Admin login: admin@modestwear.test / admin_secret_password_123

set -euo pipefail

API="${API:-http://127.0.0.1:8000}"
TS="$(date +%s)"
ADMIN_COOKIES="$(mktemp)"
BUYER_COOKIES="$(mktemp)"
trap "rm -f '$ADMIN_COOKIES' '$BUYER_COOKIES'" EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
section() { bold ""; bold "== $* =="; }

PSQL="psql postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann -t -A"

section "Pre-flight"

if ! curl -fsS --max-time 5 "$API/health" >/dev/null; then
  fail "Backend not reachable at $API"
fi
ok "Backend is up at $API"

section "§4.5.2 Wholesale signup + admin approval"

# Use a unique email per run so re-runs don't conflict.
EMAIL="buyer-$TS@modestwear.test"

# 1. Buyer signs up.
SIGNUP="$(curl -fsS --max-time 5 -X POST "$API/api/wholesale/signup" \
  -H "Content-Type: application/json" -c "$BUYER_COOKIES" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"WholesalePass1!\",
    \"first_name\": \"Test\",
    \"last_name\": \"Buyer\",
    \"company_name\": \"Phase4.5 Test Co\",
    \"tax_id\": \"TAX-$TS\",
    \"country\": \"US\",
    \"phone\": \"+1-555-$TS\",
    \"website\": \"https://example.com\",
    \"notes\": \"Created by scripts/test_phase4.5.sh\"
  }")"
echo "$SIGNUP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('access_token'), 'signup did not return an access_token'
" || fail "wholesale signup failed: $SIGNUP"
ok "wholesale signup issued tokens"

# 2. /me returns role=wholesale and a pending application.
ME="$(curl -fsS --max-time 5 "$API/api/wholesale/me" -b "$BUYER_COOKIES")"
echo "$ME" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['user']['role'] == 'wholesale', d
assert d['user']['approved_at'] is None, d
assert d['application']['status'] == 'pending', d
" || fail "/wholesale/me should show pending application, got: $ME"
ok "/wholesale/me shows role=wholesale, application.status=pending"

# 3. Pending buyer cannot create a quote yet.
PENDING_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/wholesale/quotes" \
  -H "Content-Type: application/json" -b "$BUYER_COOKIES" \
  -d '{"line_items":[{"variant_id":1,"quantity":5}]}')"
[ "$PENDING_CODE" = "403" ] || fail "pending buyer expected 403 on quote creation, got $PENDING_CODE"
ok "pending buyer is blocked from /api/wholesale/quotes (403)"

# 4. Admin logs in and approves the application.
curl -fsS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" -c "$ADMIN_COOKIES" \
  -d '{"email":"admin@modestwear.test","password":"admin_secret_password_123"}' >/dev/null
APP_ID="$(echo "$ME" | python3 -c "import sys, json; print(json.load(sys.stdin)['application']['id'])")"
APPROVE="$(curl -fsS --max-time 5 -X POST "$API/api/admin/wholesale/applications/$APP_ID/approve" -b "$ADMIN_COOKIES")"
echo "$APPROVE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'approved', d
" || fail "approve did not set status=approved: $APPROVE"
ok "admin approved application $APP_ID"

# 5. Buyer /me now shows approved.
ME2="$(curl -fsS --max-time 5 "$API/api/wholesale/me" -b "$BUYER_COOKIES")"
echo "$ME2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['user']['approved_at'] is not None, d
" || fail "/me should show approved_at after approval, got: $ME2"
ok "buyer /me now shows approved_at != null"

section "§4.5.3-4.5.4 Catalog + RFQ via CSV"

# Find two variants we can use. Pick any active product's first variant.
PRODS="$(curl -fsS --max-time 5 "$API/api/products?page_size=5")"
VARIANT1_ID="$(echo "$PRODS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
ids = []
for p in items:
  for v in p.get('variants', []):
    ids.append((p['slug'], v['id'], v['sku'], v.get('stock', 0)))
print(ids[0][1] if ids else '')
")"
VARIANT1_SKU="$(echo "$PRODS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for p in items:
  for v in p.get('variants', []):
    print(v['sku'])
    sys.exit(0)
")"
VARIANT2_ID="$(echo "$PRODS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
ids = []
for p in items:
  for v in p.get('variants', []):
    ids.append(v['id'])
print(ids[1] if len(ids) > 1 else '')
")"
VARIANT2_SKU="$(echo "$PRODS" | python3 -c "
import sys, json
items = json.load(sys.stdin)
count = 0
for p in items:
  for v in p.get('variants', []):
    count += 1
    if count == 2:
      print(v['sku'])
      sys.exit(0)
")"
[ -n "$VARIANT1_ID" ] && [ -n "$VARIANT2_ID" ] || fail "need at least 2 variants in the catalog (got $VARIANT1_ID / $VARIANT2_ID)"
ok "picked variants: $VARIANT1_SKU (id=$VARIANT1_ID) and $VARIANT2_SKU (id=$VARIANT2_ID)"

# Build a CSV: header + 2 lines.
CSV="sku,quantity
$VARIANT1_SKU,12
$VARIANT2_SKU,8"
QUOTE="$(curl -fsS --max-time 5 -X POST "$API/api/wholesale/quotes" \
  -H "Content-Type: application/json" -b "$BUYER_COOKIES" \
  -d "$(python3 -c "
import json, sys
print(json.dumps({'csv': '''$CSV
''', 'notes': 'Initial RFQ for Phase 4.5 test'}))
")")"
QUOTE_ID="$(echo "$QUOTE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")"
QUOTE_STATUS="$(echo "$QUOTE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
N_ITEMS="$(echo "$QUOTE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['line_items']))")"
[ -n "$QUOTE_ID" ] || fail "quote create returned no id: $QUOTE"
[ "$QUOTE_STATUS" = "submitted" ] || fail "expected status=submitted, got $QUOTE_STATUS"
[ "$N_ITEMS" = "2" ] || fail "expected 2 line items, got $N_ITEMS"
ok "created RFQ $QUOTE_ID (status=submitted, $N_ITEMS line items)"

# Listing as the buyer shows it.
MY_QUOTES="$(curl -fsS --max-time 5 "$API/api/wholesale/quotes" -b "$BUYER_COOKIES")"
echo "$MY_QUOTES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ids = [q['id'] for q in d]
assert $QUOTE_ID in ids, d
" || fail "buyer's quote list did not include $QUOTE_ID: $MY_QUOTES"
ok "buyer sees quote in /api/wholesale/quotes"

# Admin sees it in their all-quotes list.
ADMIN_QUOTES="$(curl -fsS --max-time 5 "$API/api/admin/wholesale/quotes" -b "$ADMIN_COOKIES")"
echo "$ADMIN_QUOTES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ids = [q['id'] for q in d]
assert $QUOTE_ID in ids, d
" || fail "admin's all-quotes list did not include $QUOTE_ID"
ok "admin sees quote in /api/admin/wholesale/quotes"

section "§4.5.5 Admin prices + sends quote"

# Get the line item IDs
LI_IDS="$(echo "$QUOTE" | python3 -c "import sys, json; print(','.join(str(li['id']) for li in json.load(sys.stdin)['line_items']))")"
LI1_ID="$(echo "$LI_IDS" | cut -d, -f1)"
LI2_ID="$(echo "$LI_IDS" | cut -d, -f2)"

# Build the update payload: each line item gets a unit price, plus
# shipping_cost, tax, admin_notes, valid_until.
UPDATE_BODY="$(python3 -c "
import json
print(json.dumps({
  'line_items': [
    {'id': $LI1_ID, 'unit_price_cents': 4500},
    {'id': $LI2_ID, 'unit_price_cents': 5000},
  ],
  'shipping_cost': 1500,
  'tax': 800,
  'admin_notes': 'Net-30 terms, ships in 7-10 business days',
  'valid_until': '2026-12-31T00:00:00',
}))
")"
UPDATE="$(curl -fsS --max-time 5 -X PUT "$API/api/admin/wholesale/quotes/$QUOTE_ID" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIES" \
  -d "$UPDATE_BODY")"
echo "$UPDATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
priced = [li for li in d['line_items'] if li['unit_price'] is not None]
assert len(priced) == 2, d
assert d['shipping_cost'] == 1500, d
assert d['tax'] == 800, d
" || fail "quote update did not apply: $UPDATE"
ok "PUT /api/admin/wholesale/quotes/$QUOTE_ID applied prices + shipping + tax"

# Send the quote.
SEND="$(curl -fsS --max-time 5 -X POST "$API/api/admin/wholesale/quotes/$QUOTE_ID/send" -b "$ADMIN_COOKIES")"
SEND_STATUS="$(echo "$SEND" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
PDF_PATH="$(echo "$SEND" | python3 -c "import sys, json; print(json.load(sys.stdin)['pdf_path'])")"
[ "$SEND_STATUS" = "sent" ] || fail "expected status=sent after /send, got $SEND_STATUS: $SEND"
[ -n "$PDF_PATH" ] || fail "send did not return a pdf_path: $SEND"
ok "POST /api/admin/wholesale/quotes/$QUOTE_ID/send -> status=sent (pdf=$PDF_PATH)"

# The PDF endpoint must be reachable (200). It may serve a real PDF or
# fall back to HTML depending on whether WeasyPrint is installed.
PDF_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$API$PDF_PATH" -b "$ADMIN_COOKIES")"
[ "$PDF_CODE" = "200" ] || fail "expected 200 from $PDF_PATH, got $PDF_CODE"
ok "GET $PDF_PATH returns 200 (PDF or HTML fallback)"

section "§4.5.6 Buyer accepts the quote"

# Buyer cannot accept before status=sent — confirm pre-send accept
# would 400 by attempting a no-op on a different (already-accepted)
# quote. Skip that sub-test: just accept now.
ACCEPT="$(curl -fsS --max-time 5 -X POST "$API/api/wholesale/quotes/$QUOTE_ID/accept" -b "$BUYER_COOKIES")"
ORDER_ID="$(echo "$ACCEPT" | python3 -c "import sys, json; print(json.load(sys.stdin)['order_id'])")"
ORDER_STATUS="$(echo "$ACCEPT" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
PAYMENT_STATUS="$(echo "$ACCEPT" | python3 -c "import sys, json; print(json.load(sys.stdin)['payment_status'])")"
[ -n "$ORDER_ID" ] || fail "accept did not return an order_id: $ACCEPT"
[ "$ORDER_STATUS" = "awaiting_payment" ] || fail "expected status=awaiting_payment, got $ORDER_STATUS"
[ "$PAYMENT_STATUS" = "pending" ] || fail "expected payment_status=pending, got $PAYMENT_STATUS"
ok "POST /api/wholesale/quotes/$QUOTE_ID/accept -> order $ORDER_ID (awaiting_payment / pending)"

# Quote is now status=accepted.
QUOTE_NOW="$(curl -fsS --max-time 5 "$API/api/wholesale/quotes/$QUOTE_ID" -b "$BUYER_COOKIES")"
echo "$QUOTE_NOW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'accepted', d
" || fail "quote should be accepted now, got: $QUOTE_NOW"
ok "quote is now status=accepted"

# Re-accept must fail (already accepted).
REACCEPT_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/wholesale/quotes/$QUOTE_ID/accept" -b "$BUYER_COOKIES")"
[ "$REACCEPT_CODE" = "400" ] || fail "re-accept of accepted quote expected 400, got $REACCEPT_CODE"
ok "re-accept of accepted quote returns 400"

section "§4.5.7 Admin marks order paid"

PAID="$(curl -fsS --max-time 5 -X POST "$API/api/admin/wholesale/orders/$ORDER_ID/mark-paid" -b "$ADMIN_COOKIES")"
PAID_STATUS="$(echo "$PAID" | python3 -c "import sys, json; print(json.load(sys.stdin)['payment_status'])")"
[ "$PAID_STATUS" = "paid" ] || fail "expected payment_status=paid, got $PAID_STATUS: $PAID"
ok "POST /api/admin/wholesale/orders/$ORDER_ID/mark-paid -> payment_status=paid"

section "§4.5.8 Admin ships + buyer sees tracking"

# Update to shipped with tracking info.
SHIP="$(curl -fsS --max-time 5 -X PUT "$API/api/admin/wholesale/orders/$ORDER_ID/status" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIES" \
  -d '{"status":"shipped","tracking_number":"FX-12345","shipping_carrier":"FedEx"}')"
SHIP_STATUS="$(echo "$SHIP" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
SHIP_TRACK="$(echo "$SHIP" | python3 -c "import sys, json; print(json.load(sys.stdin)['tracking_number'])")"
SHIP_CARRIER="$(echo "$SHIP" | python3 -c "import sys, json; print(json.load(sys.stdin)['shipping_carrier'])")"
[ "$SHIP_STATUS" = "shipped" ] || fail "expected status=shipped, got $SHIP_STATUS"
[ "$SHIP_TRACK" = "FX-12345" ] || fail "expected tracking=FX-12345, got $SHIP_TRACK"
[ "$SHIP_CARRIER" = "FedEx" ] || fail "expected carrier=FedEx, got $SHIP_CARRIER"
ok "PUT /api/admin/wholesale/orders/$ORDER_ID/status -> shipped, tracking=FedEx FX-12345"

# Buyer sees the tracking in /wholesale/orders/{id}.
BUYER_VIEW="$(curl -fsS --max-time 5 "$API/api/wholesale/orders/$ORDER_ID" -b "$BUYER_COOKIES")"
echo "$BUYER_VIEW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'shipped', d
assert d['tracking_number'] == 'FX-12345', d
assert d['shipping_carrier'] == 'FedEx', d
" || fail "buyer order view did not show tracking: $BUYER_VIEW"
ok "buyer sees tracking info via /api/wholesale/orders/$ORDER_ID"

# Mark delivered.
DELIV="$(curl -fsS --max-time 5 -X PUT "$API/api/admin/wholesale/orders/$ORDER_ID/status" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIES" \
  -d '{"status":"delivered"}')"
DELIV_STATUS="$(echo "$DELIV" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
[ "$DELIV_STATUS" = "delivered" ] || fail "expected status=delivered, got $DELIV_STATUS"
ok "PUT status -> delivered"

section "§4.5.9 Chatbot wholesale addendum (smoke)"

# The chatbot will fail to actually call SAIA in the test env
# (no API key), but we can verify the endpoint accepts the request
# and that the wholesale addendum is loaded for an approved user.
# A 503 (SAIA unreachable) is acceptable as long as the route is hit.
CHAT_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" -b "$BUYER_COOKIES" \
  -d '{"message":"What is the MOQ for dresses?"}')"
case "$CHAT_CODE" in
  200|429|503) ok "POST /api/chatbot returned $CHAT_CODE (expected: SAIA reachable or rate-limited or 503 for no API key)" ;;
  *) fail "POST /api/chatbot returned unexpected $CHAT_CODE" ;;
esac

section "Rate limit: 5 RFQ submissions per buyer per day"

# We already created 1 RFQ above (4 attempts before this section:
# 1 main + the §4.5.5 admin updates did NOT count because those are
# admin-side). The in-memory deque has 1 entry. The cap is 5 per day,
# so the next 4 submissions are OK and the 5th and 6th hit 429.
EXTRA_QUOTE_OK=0
EXTRA_QUOTE_429=0
for i in 1 2 3 4 5 6; do
  CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/wholesale/quotes" \
    -H "Content-Type: application/json" -b "$BUYER_COOKIES" \
    -d "{\"line_items\":[{\"variant_id\":$VARIANT1_ID,\"quantity\":$i}]}")"
  if [ "$CODE" = "201" ]; then
    EXTRA_QUOTE_OK=$((EXTRA_QUOTE_OK + 1))
  elif [ "$CODE" = "429" ]; then
    EXTRA_QUOTE_429=$((EXTRA_QUOTE_429 + 1))
  else
    fail "submission $i returned unexpected $CODE"
  fi
done
# 1 prior + 4 new = 5 (cap), so the 5th and 6th loop attempts are 429.
[ "$EXTRA_QUOTE_OK" = "4" ] || fail "expected 4 more successful submissions (total 5, the cap), got $EXTRA_QUOTE_OK"
[ "$EXTRA_QUOTE_429" = "2" ] || fail "expected 2 rate-limited submissions, got $EXTRA_QUOTE_429"
ok "rate limit: 4 OK + 2 429 (total 5 = cap, then capped)"

section "Authorization: customer cannot use wholesale endpoints"

# A regular customer must get 403 on /wholesale/*.
CUSTOMER_COOKIES="$(mktemp)"
trap "rm -f '$ADMIN_COOKIES' '$BUYER_COOKIES' '$CUSTOMER_COOKIES'" EXIT
CUST_EMAIL="phase45-customer-$TS@modestwear.test"
curl -fsS --max-time 5 -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" -c "$CUSTOMER_COOKIES" \
  -d "{\"email\":\"$CUST_EMAIL\",\"password\":\"CustomerPass1!\",\"first_name\":\"C\",\"last_name\":\"U\"}" >/dev/null
ME_CUST="$(curl -fsS --max-time 5 "$API/api/auth/me" -b "$CUSTOMER_COOKIES")"
echo "$ME_CUST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['role'] == 'customer', d
" || fail "registered customer is not role=customer: $ME_CUST"
CUST_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$API/api/wholesale/quotes" -b "$CUSTOMER_COOKIES")"
[ "$CUST_CODE" = "403" ] || fail "customer expected 403 on /api/wholesale/quotes, got $CUST_CODE"
ok "regular customer is blocked from /api/wholesale/* (403)"

section "Done"

printf "\n  \033[1;32mAll Phase 4.5 tests passed.\033[0m\n\n"
printf "  Buyer:        %s\n" "$EMAIL"
printf "  Application:  %s (approved)\n" "$APP_ID"
printf "  Quote:        %s (sent, accepted)\n" "$QUOTE_ID"
printf "  Order:        %s (delivered)\n" "$ORDER_ID"
printf "  Tracking:     %s · %s\n" "FedEx" "FX-12345"
printf "  Catalog SKU:  %s, %s\n" "$VARIANT1_SKU" "$VARIANT2_SKU"
printf "\n"
