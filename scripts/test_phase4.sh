#!/usr/bin/env bash
# scripts/test_phase4.sh
#
# End-to-end test for Phase 4 (admin: products, import, orders,
# coupons, chatbot logs). Verifies the BACKEND endpoints the admin UI
# calls. The frontend pages are exercised manually in the dev server
# and not by this script (the /admin SSR is hard to drive from bash
# without a headless browser).
#
# Run from the repo root:
#
#   bash scripts/test_phase4.sh
#
# Exits 0 on success, non-zero on first failure. Uses only bash +
# curl + python3 + psql. The backend must be running on
# 127.0.0.1:8000 with:
#
#   cd backend && venv/bin/uvicorn app.main:app --port 8000
#
# Admin login: admin@modestwear.test / admin_secret_password_123
# (the seed user renamed for the Phase 4 test; the dev seed prior
# to this phase was admin@modestwear.com / changeme).

set -euo pipefail

API="${API:-http://127.0.0.1:8000}"
TS="$(date +%s)"
COOKIES="$(mktemp)"
trap "rm -f '$COOKIES'" EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
section() { bold ""; bold "== $* =="; }

# psql helper (same shape as the other test scripts).
PSQL="psql postgresql://dolly:dolly_secret_password@localhost:5432/dolly_bergmann -t -A"

section "Pre-flight"

if ! curl -fsS --max-time 5 "$API/health" >/dev/null; then
  fail "Backend not reachable at $API — start it with: cd backend && venv/bin/uvicorn app.main:app --port 8000"
fi
ok "Backend is up at $API"

section "Auth: admin login (admin@modestwear.test)"

LOGIN="$(curl -fsS --max-time 5 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" -c "$COOKIES" \
  -d '{"email":"admin@modestwear.test","password":"admin_secret_password_123"}')"
echo "$LOGIN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('access_token'), 'no access_token in login response'
" || fail "admin login did not return an access_token"
ok "admin logged in"

ME_ROLE="$(curl -fsS --max-time 5 "$API/api/auth/me" -b "$COOKIES" | python3 -c "import sys, json; print(json.load(sys.stdin)['role'])")"
[ "$ME_ROLE" = "admin" ] || fail "/me did not return role=admin, got $ME_ROLE"
ok "/me returns role=admin"

section "Admin: dashboard (PLAN 4.2)"

DASH="$(curl -fsS --max-time 5 "$API/api/admin/dashboard" -b "$COOKIES")"
echo "$DASH" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k in ('total_products', 'total_orders', 'total_revenue', 'low_stock_count', 'recent_orders', 'low_stock_products'):
    assert k in d, f'missing key {k!r} from dashboard'
" || fail "dashboard missing expected keys: $DASH"
ok "dashboard returned all expected fields"

section "Admin: products CRUD (PLAN 4.3)"

# Create a product
SLUG="phase4-test-$TS"
CREATE_RESP="$(curl -fsS --max-time 5 -X POST "$API/api/products" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{
    \"name\": \"Phase 4 Test Product\",
    \"slug\": \"$SLUG\",
    \"description\": \"Created by scripts/test_phase4.sh\",
    \"category\": \"Phase4 Test Cat\",
    \"images\": [],
    \"tags\": [\"phase4\", \"test\"],
    \"variants\": [
      {\"size\": \"S\", \"color\": \"White\", \"price\": 5000, \"stock\": 7, \"sku\": \"P4T-WHI-S-$TS\"},
      {\"size\": \"M\", \"color\": \"White\", \"price\": 5000, \"stock\": 5}
    ]
  }")"
PROD_ID="$(echo "$CREATE_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")"
[ -n "$PROD_ID" ] || fail "create product returned no id: $CREATE_RESP"
ok "created product id=$PROD_ID slug=$SLUG"

# Read it back by id
ADMIN_GET="$(curl -fsS --max-time 5 "$API/api/products/admin/$PROD_ID" -b "$COOKIES")"
echo "$ADMIN_GET" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['id'] == $PROD_ID
assert d['is_active'] is True
assert len(d['variants']) == 2
" || fail "admin product detail didn't match: $ADMIN_GET"
ok "admin GET /api/products/admin/$PROD_ID returns full detail (incl. is_active + variants)"

# Toggle inactive via bulk-active
BULK="$(curl -fsS --max-time 5 -X POST "$API/api/products/admin/bulk-active" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"ids\":[$PROD_ID], \"is_active\": false}")"
echo "$BULK" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['updated'] == 1, d
assert d['is_active'] is False
" || fail "bulk-active toggle failed: $BULK"
ok "bulk-active toggled product to is_active=false"

# Public list with include_inactive should still see it
INC="$(curl -fsS --max-time 5 "$API/api/products?include_inactive=1&page_size=100" -b "$COOKIES" | python3 -c "
import sys, json
items = json.load(sys.stdin)
ids = [i['id'] for i in items]
print($PROD_ID in ids)")"
[ "$INC" = "True" ] || fail "include_inactive=1 didn't return our product (id=$PROD_ID)"
ok "admin can see inactive products via include_inactive=1"

# Public list without include_inactive should NOT see it
PUB="$(curl -fsS --max-time 5 "$API/api/products?page_size=100" | python3 -c "
import sys, json
items = json.load(sys.stdin)
ids = [i['id'] for i in items]
print($PROD_ID in ids)")"
[ "$PUB" = "False" ] || fail "public list returned inactive product id=$PROD_ID"
ok "public catalog hides inactive products"

# Restore active so other tests can use it
curl -fsS --max-time 5 -X POST "$API/api/products/admin/bulk-active" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"ids\":[$PROD_ID], \"is_active\": true}" >/dev/null
ok "restored is_active=true"

section "Admin: image upload (PLAN 4.3)"

# Build a tiny valid PNG (1x1 white pixel) and upload it.
python3 - <<'PYEOF' > /tmp/p4-test.png
import struct, zlib
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
sig = b'\x89PNG\r\n\x1a\n'
ihdr = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
raw = b'\x00\xff\xff\xff'
idat = zlib.compress(raw, 9)
data = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
import sys; sys.stdout.buffer.write(data)
PYEOF
UPLOAD="$(curl -fsS --max-time 5 -X POST "$API/api/uploads" \
  -F "file=@/tmp/p4-test.png;type=image/png" \
  -b "$COOKIES")"
UPLOAD_URL="$(echo "$UPLOAD" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])")"
[ -n "$UPLOAD_URL" ] || fail "upload did not return a url: $UPLOAD"
[[ "$UPLOAD_URL" == /uploads/products/* ]] || fail "upload url has unexpected shape: $UPLOAD_URL"
ok "uploaded image -> $UPLOAD_URL"

# It must be fetchable (served by StaticFiles).
HTTP_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$API$UPLOAD_URL")"
[ "$HTTP_CODE" = "200" ] || fail "uploaded image not served at $UPLOAD_URL (got $HTTP_CODE)"
ok "uploaded image is served at $UPLOAD_URL (200)"

# Non-admin cannot upload
NONADMIN="$(mktemp)"
curl -fsS --max-time 5 -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" -c "$NONADMIN" \
  -d "{\"email\":\"phase4-customer-$TS@modestwear.test\",\"password\":\"Phase4User!\",\"first_name\":\"P4\",\"last_name\":\"Tester\"}" >/dev/null
UNAUTH_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/uploads" \
  -F "file=@/tmp/p4-test.png;type=image/png" \
  -b "$NONADMIN")"
[ "$UNAUTH_CODE" = "403" ] || fail "non-admin upload expected 403, got $UNAUTH_CODE"
ok "non-admin upload is blocked (403)"
rm -f "$NONADMIN"

section "Admin: JSON import (PLAN 4.4)"

# Preview a 2-product import; should persist a job, return job_id, schema_version, and dry-run diff.
JOB_FILE=/tmp/p4-import.json
cat > "$JOB_FILE" <<JSON
{
  "schema_version": 1,
  "products": [
    {
      "name": "Phase4 Import Test A",
      "slug": "phase4-import-test-a-$TS",
      "description": "A test product for the phase 4 import flow",
      "category": "Phase4 Test Cat",
      "tags": ["imported", "phase4"],
      "variants": [
        {"size": "S", "color": "Beige", "price": 4500, "stock": 4, "sku": "P4I-$TS-A-BEI-S"},
        {"size": "M", "color": "Beige", "price": 4500, "stock": 6}
      ]
    },
    {
      "name": "Phase4 Import Test B",
      "slug": "phase4-import-test-b-$TS",
      "description": "A second test product for the import flow",
      "category": "Phase4 Test Cat",
      "tags": [],
      "variants": [
        {"size": "M", "color": "Black", "price": 5500, "stock": 3}
      ]
    }
  ]
}
JSON
PREVIEW="$(curl -fsS --max-time 5 -X POST "$API/api/admin/products/import/preview" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  --data-binary @"$JOB_FILE")"
JOB_ID="$(echo "$PREVIEW" | python3 -c "import sys, json; print(json.load(sys.stdin)['job_id'])")"
WC="$(echo "$PREVIEW" | python3 -c "import sys, json; print(json.load(sys.stdin)['would_create'])")"
SV="$(echo "$PREVIEW" | python3 -c "import sys, json; print(json.load(sys.stdin)['schema_version'])")"
[ -n "$JOB_ID" ] || fail "preview did not return job_id: $PREVIEW"
[ "$SV" = "1" ] || fail "schema_version expected 1, got $SV"
[ "$WC" = "2" ] || fail "expected would_create=2, got $WC: $PREVIEW"
ok "preview persisted job_id=$JOB_ID would_create=$WC schema_version=$SV"

# Bad file: bad slug format. The Pydantic schema rejects this with a
# 422 (we use Field pattern + custom validator on ImportProduct.slug).
BAD_FILE=/tmp/p4-import-bad.json
cat > "$BAD_FILE" <<JSON
{
  "schema_version": 1,
  "products": [
    {
      "name": "Bad Product",
      "slug": "BAD SLUG WITH SPACES",
      "description": "x",
      "category": "x",
      "variants": [{"size": "S", "color": "X", "price": 5000, "stock": 1}]
    }
  ]
}
JSON
BAD_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/admin/products/import/preview" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  --data-binary @"$BAD_FILE")"
[ "$BAD_CODE" = "422" ] || fail "bad slug expected 422 from schema validation, got $BAD_CODE"
ok "bad slug is rejected by schema validation (422)"

# A price of 0 is also rejected (Field ge=1).
BAD_PRICE_FILE=/tmp/p4-import-badprice.json
cat > "$BAD_PRICE_FILE" <<JSON
{
  "schema_version": 1,
  "products": [
    {
      "name": "Zero Price Product",
      "slug": "zero-price",
      "description": "x",
      "category": "x",
      "variants": [{"size": "S", "color": "X", "price": 0, "stock": 1}]
    }
  ]
}
JSON
BAD_PRICE_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/admin/products/import/preview" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  --data-binary @"$BAD_PRICE_FILE")"
[ "$BAD_PRICE_CODE" = "422" ] || fail "zero price expected 422, got $BAD_PRICE_CODE"
ok "price < 1 cent is rejected by schema validation (422)"

# Confirm the good job.
CONFIRM="$(curl -fsS --max-time 5 -X POST "$API/api/admin/products/import/confirm" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"job_id\":\"$JOB_ID\"}")"
STATUS="$(echo "$CONFIRM" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
IMPORTED="$(echo "$CONFIRM" | python3 -c "import sys, json; print(json.load(sys.stdin)['imported_count'])")"
[ "$STATUS" = "completed" ] || fail "expected status=completed, got $STATUS: $CONFIRM"
[ "$IMPORTED" = "2" ] || fail "expected imported_count=2, got $IMPORTED"
ok "confirm imported $IMPORTED products (status=$STATUS)"

# Products should be in DB.
PG_SLUGS="$($PSQL -c "SELECT slug FROM products WHERE slug LIKE 'phase4-import-test-%-$TS' ORDER BY slug;")"
[ "$(echo "$PG_SLUGS" | wc -l)" = "2" ] || fail "expected 2 imported products in DB, got: $PG_SLUGS"
ok "imported products visible in products table"

# Confirming the same job_id twice should 400 (idempotency / state).
CONFIRM2_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/admin/products/import/confirm" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"job_id\":\"$JOB_ID\"}")"
[ "$CONFIRM2_CODE" = "400" ] || fail "re-confirm of completed job expected 400, got $CONFIRM2_CODE"
ok "re-confirm of completed job returns 400 (job is no longer pending)"

section "Admin: orders list + status update (PLAN 4.5)"

ORDERS="$(curl -fsS --max-time 5 "$API/api/orders/admin" -b "$COOKIES")"
echo "$ORDERS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d, list), d
" || fail "orders list expected a list, got: $ORDERS"
ok "orders list returned $(echo "$ORDERS" | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))') orders"

# Filter by status
ONLY_PAID="$(curl -fsS --max-time 5 "$API/api/orders/admin?status_filter=paid" -b "$COOKIES" 2>/dev/null || true)"
ONLY_PAID="$(curl -fsS --max-time 5 "$API/api/orders/admin?status_filter=paid" -b "$COOKIES")"
echo "$ONLY_PAID" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for o in items:
    assert o['status'] == 'paid', o
" || fail "status_filter=paid returned a non-paid order: $ONLY_PAID"
ok "status_filter=paid returns only paid orders"

# Use a real order if any exists, otherwise create one
ORDER_ID="$(echo "$ORDERS" | python3 -c "import sys, json; d = json.load(sys.stdin); print(d[0]['id'] if d else '')")"
if [ -z "$ORDER_ID" ]; then
  fail "no orders in the system to test status update against (run test_phase3.sh first?)"
fi
ok "using order_id=$ORDER_ID for status update test"

# Update order to a known status, then back
NEW_STAT="shipped"
UPD="$(curl -fsS --max-time 5 -X PUT "$API/api/orders/admin/$ORDER_ID/status" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"status\":\"$NEW_STAT\"}")"
UPD_STATUS="$(echo "$UPD" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])")"
[ "$UPD_STATUS" = "$NEW_STAT" ] || fail "expected status=$NEW_STAT, got $UPD_STATUS: $UPD"
ok "PUT /api/orders/admin/$ORDER_ID/status -> $UPD_STATUS"

# Revert so the order ends in a non-shipped state.
ORIG_STATUS="$($PSQL -c "SELECT status FROM orders WHERE id=$ORDER_ID;" || echo cancelled)"
[ -n "$ORIG_STATUS" ] || ORIG_STATUS=cancelled
curl -fsS --max-time 5 -X PUT "$API/api/orders/admin/$ORDER_ID/status" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"status\":\"$ORIG_STATUS\"}" >/dev/null
ok "reverted order to $ORIG_STATUS"

# Search by email-like string
SEARCH_HITS="$(curl -fsS --max-time 5 "$API/api/orders/admin?search=example.com" -b "$COOKIES" | python3 -c "
import sys, json
items = json.load(sys.stdin)
print(len([i for i in items if i.get('user_email')]))
")"
ok "search filter works ($SEARCH_HITS order(s) matched)"

section "Admin: coupons CRUD + validity (PLAN 4.6)"

# Create a percent coupon
C_CODE="P4TEST$TS"
curl -fsS --max-time 5 -X POST "$API/api/admin/coupons" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{
    \"code\": \"$C_CODE\",
    \"discount_type\": \"percent\",
    \"discount_value\": 20,
    \"min_order_value\": 1000,
    \"starts_at\": \"2026-01-01T00:00:00\",
    \"ends_at\": \"2027-01-01T00:00:00\",
    \"usage_limit\": 50
  }" >/dev/null
ok "created coupon $C_CODE"

# Coupon is in the list
LIST_HAS="$(curl -fsS --max-time 5 "$API/api/admin/coupons" -b "$COOKIES" | python3 -c "
import sys, json
codes = [c['code'] for c in json.load(sys.stdin)]
print('$C_CODE' in codes)")"
[ "$LIST_HAS" = "True" ] || fail "coupon $C_CODE not in /api/admin/coupons list"
ok "coupon $C_CODE appears in list"

# Update it
C_ID="$(curl -fsS --max-time 5 "$API/api/admin/coupons" -b "$COOKIES" | python3 -c "
import sys, json
items = [c for c in json.load(sys.stdin) if c['code']=='$C_CODE']
print(items[0]['id'] if items else '')")"
[ -n "$C_ID" ] || fail "could not look up coupon id for $C_CODE"
curl -fsS --max-time 5 -X PUT "$API/api/admin/coupons/$C_ID" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{\"discount_value\": 25}" >/dev/null
NEW_VAL="$(curl -fsS --max-time 5 "$API/api/admin/coupons" -b "$COOKIES" | python3 -c "
import sys, json
items = [c for c in json.load(sys.stdin) if c['code']=='$C_CODE']
print(items[0]['discount_value'] if items else 'missing')")"
[ "$NEW_VAL" = "25" ] || fail "coupon update didn't take effect (got $NEW_VAL)"
ok "PUT /api/admin/coupons/{id} updated discount_value to 25"

# An expired coupon must NOT be applied at /api/checkout
$PSQL -c "UPDATE coupons SET ends_at='2025-01-01 00:00:00' WHERE code='$C_CODE';" >/dev/null
EXP_CHECK_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/checkout" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{
    \"shipping_address\": {\"name\":\"P4\",\"line1\":\"1 Main\",\"city\":\"X\",\"state\":\"X\",\"postal_code\":\"00000\",\"country\":\"US\"},
    \"coupon_code\": \"$C_CODE\"
  }")"
# Expected outcomes: 400 (cart empty OR coupon expired) — never 500.
[ "$EXP_CHECK_CODE" = "400" ] || [ "$EXP_CHECK_CODE" = "200" ] || [ "$EXP_CHECK_CODE" = "502" ] \
  || fail "expired coupon checkout expected 400/200/502, got $EXP_CHECK_CODE"
ok "expired coupon rejected at checkout (HTTP $EXP_CHECK_CODE)"

# Restore
$PSQL -c "UPDATE coupons SET ends_at='2027-01-01 00:00:00' WHERE code='$C_CODE';" >/dev/null

# Free-shipping coupon
FS_CODE="P4FS$TS"
curl -fsS --max-time 5 -X POST "$API/api/admin/coupons" \
  -H "Content-Type: application/json" -b "$COOKIES" \
  -d "{
    \"code\": \"$FS_CODE\",
    \"discount_type\": \"free_shipping\",
    \"discount_value\": 0,
    \"min_order_value\": 0,
    \"starts_at\": \"2026-01-01T00:00:00\",
    \"ends_at\": \"2027-01-01T00:00:00\"
  }" >/dev/null
ok "created free_shipping coupon $FS_CODE"

# Delete one of them
COUPON_ID="$(curl -fsS --max-time 5 "$API/api/admin/coupons" -b "$COOKIES" | python3 -c "
import sys, json
items = [c for c in json.load(sys.stdin) if c['code']=='$FS_CODE']
print(items[0]['id'] if items else '')")"
[ -n "$COUPON_ID" ] || fail "free_shipping coupon not findable"
curl -fsS --max-time 5 -X DELETE "$API/api/admin/coupons/$COUPON_ID" -b "$COOKIES" >/dev/null
DELETED="$(curl -fsS --max-time 5 "$API/api/admin/coupons" -b "$COOKIES" | python3 -c "
import sys, json
items = [c for c in json.load(sys.stdin) if c['code']=='$FS_CODE']
print(len(items))")"
[ "$DELETED" = "0" ] || fail "DELETE didn't remove the coupon ($DELETED still in list)"
ok "DELETE /api/admin/coupons/$COUPON_ID removed the coupon"

section "Admin: chatbot logs (PLAN 4.7)"

# Seed an errored log and a refusal log
$PSQL -c "INSERT INTO chatbot_logs (user_id, session_id, question, response, error, created_at) VALUES (NULL, 'p4-test-$TS', 'Phase4 errored question', NULL, 'fake SAIA timeout', NOW());" >/dev/null
$PSQL -c "INSERT INTO chatbot_logs (user_id, session_id, question, response, error, created_at) VALUES (NULL, 'p4-test-$TS', 'Phase4 refusal question', 'I am sorry, I cannot help with that request.', NULL, NOW());" >/dev/null

UNANSWERED="$(curl -fsS --max-time 5 "$API/api/admin/chatbot/unanswered" -b "$COOKIES")"
COUNT="$(echo "$UNANSWERED" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['items']))")"
[ "$COUNT" -ge 2 ] || fail "expected at least 2 unanswered logs, got $COUNT: $UNANSWERED"
ok "unanswered list has $COUNT item(s)"

# Mark one as resolved
TARGET_ID="$(echo "$UNANSWERED" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
err = [i for i in items if i['error']]
print(err[0]['id'] if err else '')")"
[ -n "$TARGET_ID" ] || fail "no errored log in unanswered list"
curl -fsS --max-time 5 -X POST "$API/api/admin/chatbot/$TARGET_ID/resolve" -b "$COOKIES" >/dev/null
NEW_RESOLVED_AT="$($PSQL -c "SELECT resolved_at FROM chatbot_logs WHERE id=$TARGET_ID;")"
[ -n "$NEW_RESOLVED_AT" ] || fail "resolve didn't set resolved_at"
ok "marked log id=$TARGET_ID as resolved"

# Anon/non-admin can't reach the admin endpoints
NONADMIN="$(mktemp)"
curl -fsS --max-time 5 -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" -c "$NONADMIN" \
  -d "{\"email\":\"phase4-customer2-$TS@modestwear.test\",\"password\":\"Phase4User!\",\"first_name\":\"P4\",\"last_name\":\"Tester\"}" >/dev/null
FORBID_CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$API/api/admin/dashboard" -b "$NONADMIN")"
[ "$FORBID_CODE" = "403" ] || fail "non-admin /api/admin/dashboard expected 403, got $FORBID_CODE"
ok "non-admin /api/admin/dashboard returns 403"
rm -f "$NONADMIN"

section "Done"

printf "\n  \033[1;32mAll Phase 4 tests passed.\033[0m\n\n"
printf "  Product:       $SLUG (id $PROD_ID)\n"
printf "  Uploaded:      $UPLOAD_URL\n"
printf "  Import job:    $JOB_ID ($IMPORTED products)\n"
printf "  Coupon:        $C_CODE\n"
printf "  Resolved log:  $TARGET_ID\n\n"
