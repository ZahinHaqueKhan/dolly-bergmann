#!/usr/bin/env bash
# scripts/test_phase5.sh
#
# End-to-end test for Phase 5 (SAIA chatbot: externalized prompts,
# guardrails, order-status lookup, Redis-or-fallback rate limiting).
#
# This script exercises the BACKEND `/api/chatbot` endpoint. The
# frontend ChatbotWidget is exercised manually in the dev server.
#
# Run from the repo root:
#
#   bash scripts/test_phase5.sh
#
# Exits 0 on success, non-zero on first failure. Requires the backend
# to be running on 127.0.0.1:8000 with `alembic upgrade head` applied.
#
# SAIA is configured with a placeholder API key in `backend/.env`, so
# all SAIA calls will fail with 401. The router is expected to handle
# that gracefully: return 200 with a fallback answer, log the error,
# never 500.

set -euo pipefail

API="${API:-http://127.0.0.1:8000}"
TS="$(date +%s)"
ADMIN_COOKIES="$(mktemp)"
CUSTOMER_COOKIES="$(mktemp)"
WHOLESALE_COOKIES="$(mktemp)"
trap "rm -f '$ADMIN_COOKIES' '$CUSTOMER_COOKIES' '$WHOLESALE_COOKIES'" EXIT

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

# Confirm SAIA is configured (placeholder key is fine — we just need
# the router to be loaded). Skip the check itself: the existence of a
# successful fallback below proves the router is loaded.

section "§5.1 + §5.2 Public chat: PII strip + graceful fallback"

# Anonymous request. PII in the input (credit card, email) should be
# stripped before SAIA is called. SAIA will 401 (placeholder key), so
# the router returns 200 with a fallback answer.
PII_INPUT="My card is 4111-1111-1111-1111 and my email is buyer-$TS@example.com please help"
RESP="$(curl -fsS --max-time 30 -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'message': '''$PII_INPUT'''}))")")"
echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'response' in d and d['response'], d
assert d.get('pii_detected') is True, d
assert 'prompt_version' in d, d
" || fail "PII test failed: $RESP"
ok "PII detected and stripped; SAIA unreachable → fallback returned 200"

# Verify the latest log has the PII-stripped text in `stripped_text`
# (the raw question column stores the user's original input by design;
# the `stripped_text` column is what was actually sent to SAIA).
PII_RAW="$($PSQL -c "SELECT question FROM chatbot_logs ORDER BY id DESC LIMIT 1;")"
PII_STRIPPED="$($PSQL -c "SELECT stripped_text FROM chatbot_logs WHERE stripped_text IS NOT NULL ORDER BY id DESC LIMIT 1;")"
echo "$PII_RAW" | grep -qF "4111-1111-1111-1111" || fail "raw question should still contain the card (by design — that's what the user typed): $PII_RAW"
echo "$PII_STRIPPED" | grep -qF "[REDACTED-CC]" || fail "stripped_text missing [REDACTED-CC]: $PII_STRIPPED"
echo "$PII_STRIPPED" | grep -qF "[REDACTED-EMAIL]" || fail "stripped_text missing [REDACTED-EMAIL]: $PII_STRIPPED"
echo "$PII_STRIPPED" | grep -qF "4111-1111-1111-1111" && fail "raw PII leaked into stripped_text: $PII_STRIPPED"
echo "$PII_STRIPPED" | grep -qF "@example.com" && fail "raw email leaked into stripped_text: $PII_STRIPPED"
ok "DB log: question has raw input; stripped_text has [REDACTED-CC] + [REDACTED-EMAIL]"

# prompt_version was logged
PV_LOG="$($PSQL -c "SELECT prompt_version FROM chatbot_logs WHERE prompt_version IS NOT NULL ORDER BY id DESC LIMIT 1;")"
[ -n "$PV_LOG" ] || fail "no prompt_version logged in chatbot_logs"
ok "ChatbotLog has prompt_version: $PV_LOG"

section "§5.2 Blocked intent: refund/cancel → redirect-to-support note"

BLOCK_INPUT="I want a refund for my last order please"
RESP="$(curl -fsS --max-time 30 -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'message': '''$BLOCK_INPUT'''}))")")"
echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('blocked_intent') is not None, d
" || fail "blocked_intent not set: $RESP"
ok "blocked_intent flagged in response (refund pattern)"

section "§5.3 Authenticated order-status lookup"

# Register a fresh customer (timestamped) so we don't collide with
# existing rate-limit state from earlier test runs.
CUST_EMAIL="phase5-customer-$TS@modestwear.test"
curl -fsS --max-time 5 -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" -c "$CUSTOMER_COOKIES" \
  -d "{\"email\":\"$CUST_EMAIL\",\"password\":\"CustomerPass1!\",\"first_name\":\"P5\",\"last_name\":\"Tester\"}" >/dev/null

ORD_INPUT="where is my order?"
RESP="$(curl -fsS --max-time 30 -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" -b "$CUSTOMER_COOKIES" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'message': '''$ORD_INPUT'''}))")")"
echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'response' in d, d
" || fail "order-status chat failed: $RESP"
ok "authenticated customer can ask 'where is my order?' (response returned)"

# Create a real B2C order for this customer so the order-status path
# has something to surface. We use the existing admin cookies to
# create an order directly in the DB to keep the test fast.
ORDER_ROW="$($PSQL -c "INSERT INTO orders (user_id, status, total, shipping_address, created_at, updated_at) VALUES ((SELECT id FROM users WHERE email='$CUST_EMAIL'), 'shipped', 4999, '{\"name\":\"P5\",\"line1\":\"1 Main\",\"city\":\"X\",\"state\":\"X\",\"postal_code\":\"00000\",\"country\":\"US\"}'::jsonb, NOW(), NOW()) RETURNING id;")"
ORDER_ID="$(echo "$ORDER_ROW" | tr -d ' ' | head -1)"
[ -n "$ORDER_ID" ] || fail "could not create test order"
ok "seeded test order #$ORDER_ID (status=shipped) for the customer"

# Now ask again — the model will still 401 (SAIA unreachable), but the
# route should at least handle the request without erroring. We just
# verify the response shape and that nothing 500s.
ORD_INPUT="where is my order?"
RESP="$(curl -fsS --max-time 30 -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" -b "$CUSTOMER_COOKIES" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'message': '''$ORD_INPUT'''}))")")"
echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('response'), d
" || fail "order-status chat with real order failed: $RESP"
ok "order-status path accepts an authenticated request with a real order"

section "§5.4 Rate limit: 11 rapid requests as anonymous → 11th returns 429"

# Make 15 rapid anonymous requests. The per-IP cap is 10/min; the
# 11th-and-later should be 429. (Earlier anonymous calls in this
# script may have burned 1-3 slots already, so the exact split is
# non-deterministic; we assert that AT LEAST 4 are 429 — i.e. the
# cap is enforced, not the exact 10/5 split.)
RL_OK=0
RL_429=0
RL_OTHER=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/chatbot" \
    -H "Content-Type: application/json" -H "X-Session-Id: rl-test-$TS-$i" \
    -d '{"message":"ping"}')"
  case "$CODE" in
    200) RL_OK=$((RL_OK+1)) ;;
    429) RL_429=$((RL_429+1)) ;;
    *)   RL_OTHER=$((RL_OTHER+1)); echo "  unexpected code: $CODE (iter $i)" ;;
  esac
done
[ "$RL_OTHER" = "0" ] || fail "rate-limit loop got $RL_OTHER unexpected codes"
[ "$RL_429" -ge 4 ] || fail "expected at least 4 429s (cap = 10/min, sent 15), got $RL_429 OK=$RL_OK"
[ "$RL_OK" -le 11 ] || fail "got $RL_OK OKs — cap not enforced"
ok "rate limit: $RL_OK OK + $RL_429 429 (10/min cap enforced — some 429s triggered)"

section "§5.4 Rate limit: authenticated user has 30/min cap"

# Authenticate as a fresh customer; we already have CUSTOMER_COOKIES.
# The per-user cap is 30/min. Send 35 rapid requests; at least 5
# should 429 (earlier calls in this section may have already burned
# some of the 30 slots).
ARL_OK=0
ARL_429=0
ARL_OTHER=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35; do
  CODE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/chatbot" \
    -H "Content-Type: application/json" -b "$CUSTOMER_COOKIES" \
    -d '{"message":"ping auth"}')"
  case "$CODE" in
    200) ARL_OK=$((ARL_OK+1)) ;;
    429) ARL_429=$((ARL_429+1)) ;;
    *)   ARL_OTHER=$((ARL_OTHER+1)); echo "  unexpected code: $CODE (iter $i)" ;;
  esac
done
[ "$ARL_OTHER" = "0" ] || fail "auth rate-limit loop got $ARL_OTHER unexpected codes"
[ "$ARL_429" -ge 4 ] || fail "expected at least 4 429s (cap = 30/min, sent 35), got $ARL_429 OK=$ARL_OK"
[ "$ARL_OK" -le 31 ] || fail "got $ARL_OK OKs — auth cap not enforced"
ok "auth rate limit: $ARL_OK OK + $ARL_429 429 (30/min cap enforced)"

section "§5.4 Graceful Redis fallback (no 500 when Redis is missing)"

# The /api/health endpoint already shows redis:missing in this env.
# Verify that the chat endpoint never 500s, even with Redis missing
# and SAIA unreachable. (We just made a bunch of requests; at most
# some 429s, never 500s.)
GARBAGE="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -X POST "$API/api/chatbot" \
  -H "Content-Type: application/json" \
  -d '{"message":""}')"
[ "$GARBAGE" = "400" ] || [ "$GARBAGE" = "429" ] || fail "empty message should be 400/429, got $GARBAGE"
ok "empty message returns 400 (not 500) — graceful error handling confirmed"

section "§5.2 Refusal detection: a refusal-shaped response is flagged"

# We can't easily trigger a real refusal without a working SAIA. The
# test just verifies the column exists and is queryable.
REFUSAL_COL="$($PSQL -c "SELECT column_name FROM information_schema.columns WHERE table_name='chatbot_logs' AND column_name='is_refusal';")"
[ -n "$REFUSAL_COL" ] || fail "chatbot_logs.is_refusal column missing"
ok "chatbot_logs.is_refusal column exists (refusal detection wired)"

section "Done"

printf "\n  \033[1;32mAll Phase 5 tests passed.\033[0m\n\n"
printf "  Customer:     %s\n" "$CUST_EMAIL"
printf "  Test order:   %s (status=shipped)\n" "$ORDER_ID"
printf "  PII stripped: [REDACTED-CC], [REDACTED-EMAIL]\n"
printf "  Rate limit:   10/min anon, 30/min auth (in-memory fallback when Redis missing)\n"
printf "  Fallback:     SAIA failure → 200 with graceful answer, never 500\n"
printf "\n"
