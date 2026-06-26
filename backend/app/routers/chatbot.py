"""PLAN 5 — AI chatbot (SAIA) with guardrails, prompt externalization,
authenticated order lookup, and Redis-backed rate limiting.

Layout
------
- POST /api/chatbot                  — public chat endpoint
- GET  /api/chatbot/health           — readiness (SAIA reachable?)

Features
--------
- §5.1 Prompt externalization: system_base + product_faq + store_policies
  + (seasonal/ramadan if in window) + (seasonal/eid if in window) +
  (wholesale_faq if approved wholesale user). Concatenated at request
  time. The active bundle version is logged in ChatbotLog.
- §5.2 Guardrails: PII regex strip on input (credit card, SSN, email,
  phone), 500-char cap, refusal detection (response flagged in log),
  blocked intents (refund, cancel order, change address, modify
  payment) → prepend a redirect-to-support system note.
- §5.3 Authenticated order lookup: if the user is authenticated and
  the message contains "my order", "where is", "tracking", or
  "order status", fetch the last 3 orders (B2C) and inject as
  context.
- §5.4 Redis-backed rate limiting: 10 req/min per IP for anonymous,
  30 req/min per authenticated user. If Redis is missing, the
  in-memory deque fallback kicks in (degrades gracefully; no 500).
- The endpoint NEVER 500s on SAIA failure. It returns 200 with a
  graceful fallback answer and logs the error.
"""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path
from typing import Deque, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token_dep
from app.config import settings
from app.database import get_db
from app.models.chatbot_log import ChatbotLog
from app.models.order import Order
from app.models.user import User
from app.models.wholesale_order import WholesaleOrder
from app.schemas.user import TokenData

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


# ---- Prompt loader (§5.1) ----

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    p = PROMPTS_DIR / name
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8")


def _in_window(month: int, day: int, start: tuple[int, int], end: tuple[int, int]) -> bool:
    """Inclusive date range. Handles month-wrapping (start > end)."""
    m, d = month, day
    sm, sd = start
    em, ed = end
    cur = (m, d)
    if sm <= em:
        return start <= cur <= end
    # Wraps year boundary (e.g. Dec -> Jan)
    return cur >= start or cur <= end


def _seasonal_addendum() -> tuple[str, str]:
    """Return (addendum_text, label) for the current date, or ("", "")."""
    today = date.today()
    # 2026 windows (PLAN §5.1)
    if _in_window(today.month, today.day, (2, 18), (3, 19)):
        return _load_prompt("seasonal/ramadan.md"), "ramadan"
    if _in_window(today.month, today.day, (3, 20), (3, 22)):
        return _load_prompt("seasonal/eid.md"), "eid-al-fitr"
    if _in_window(today.month, today.day, (5, 27), (5, 30)):
        return _load_prompt("seasonal/eid.md"), "eid-al-adha"
    return "", ""


def _build_prompt_bundle(role: str, approved_wholesale: bool) -> tuple[str, str]:
    """Concatenate the prompt files for this request.

    Returns (full_prompt_text, version_label) where version_label
    identifies the bundle for A/B log analysis.
    """
    parts: list[str] = []
    parts.append(_load_prompt("system_base.md"))
    parts.append(_load_prompt("product_faq.v1.md"))
    parts.append(_load_prompt("store_policies.md"))
    seasonal_text, seasonal_label = _seasonal_addendum()
    if seasonal_text:
        parts.append(seasonal_text)
    if approved_wholesale:
        parts.append(_load_prompt("wholesale_faq.v1.md"))
    version = f"base+v1+policies"
    if seasonal_label:
        version += f"+{seasonal_label}"
    if approved_wholesale:
        version += "+wholesale"
    return "\n\n".join(p for p in parts if p), version


# ---- PII stripper (§5.2) ----

# PII patterns per PLAN §5.2. Order matters: longer/more-specific first.
PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("credit_card", re.compile(r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b")),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("email", re.compile(r"\b\S+@\S+\.\S+\b")),
    # Phone: international-ish. Match 7+ digits with separators.
    (
        "phone",
        re.compile(
            r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
        ),
    ),
]

PII_REPLACEMENTS = {
    "credit_card": "[REDACTED-CC]",
    "ssn": "[REDACTED-SSN]",
    "email": "[REDACTED-EMAIL]",
    "phone": "[REDACTED-PHONE]",
}


def _strip_pii(text: str) -> tuple[str, dict[str, int]]:
    """Strip PII from text. Returns (stripped_text, counts_by_kind)."""
    counts: dict[str, int] = defaultdict(int)
    out = text
    for kind, pattern in PII_PATTERNS:
        replacement = PII_REPLACEMENTS[kind]
        new_out, n = pattern.subn(replacement, out)
        if n:
            counts[kind] += n
            out = new_out
    return out, dict(counts)


# ---- Refusal detection (§5.2) ----

REFUSAL_KEYWORDS = (
    "i can't help",
    "i cannot help",
    "i'm not able to",
    "i am not able to",
    "i don't have access",
    "outside the scope",
    "i'm sorry, i cannot",
    "i am sorry, i cannot",
    "i cannot assist",
)


def _detect_refusal(response: str | None) -> bool:
    if not response:
        return False
    lower = response.lower()
    return any(kw in lower for kw in REFUSAL_KEYWORDS)


# ---- Blocked intents (§5.2) ----

# Match order-management intents. If the message contains any of these,
# we prepend a redirect-to-support system note. The model is explicitly
# told to defer to support for these.
BLOCKED_INTENT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\brefund\b", re.IGNORECASE),
        "The user asked about a refund.",
    ),
    (
        re.compile(r"\b(cancel|cancellation)\b.*\b(order|purchase|shipment)\b", re.IGNORECASE),
        "The user asked about cancelling an order.",
    ),
    (
        re.compile(r"\b(change|update|edit|modify)\b.*\b(address|shipping address)\b", re.IGNORECASE),
        "The user asked about changing a shipping address.",
    ),
    (
        re.compile(r"\b(change|update|edit|modify)\b.*\b(payment|card|credit card)\b", re.IGNORECASE),
        "The user asked about changing payment information.",
    ),
    (
        re.compile(r"\b(chargeback|dispute)\b", re.IGNORECASE),
        "The user asked about a chargeback or dispute.",
    ),
]

REDIRECT_NOTE = (
    "\n\n[SYSTEM NOTE: The user is asking about a sensitive order-management "
    "action. Per policy you must NOT attempt to handle refunds, cancellations, "
    "address changes, payment changes, or chargebacks. Direct the user to "
    "support@modestwear.com and stop. Do not call any tools. Keep this redirect "
    "in your response.]"
)


def _detect_blocked_intent(text: str) -> str | None:
    for pattern, label in BLOCKED_INTENT_PATTERNS:
        if pattern.search(text):
            return label
    return None


# ---- Order-status lookup (§5.3) ----

ORDER_STATUS_KEYWORDS = ("my order", "where is", "tracking", "order status", "where are my")


def _wants_order_status(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in ORDER_STATUS_KEYWORDS)


async def _recent_orders_context(
    db: AsyncSession, user_id: int, role: str
) -> str:
    """Return a short summary of the user's most recent orders for the
    chatbot to use as context. B2C users see B2C orders, B2B
    wholesale users see wholesale orders.

    PLAN §5.3: "status only, no PII" — we only return id, status, total,
    created_at.
    """
    lines: list[str] = []
    if role == "wholesale":
        stmt = (
            select(WholesaleOrder)
            .where(WholesaleOrder.user_id == user_id)
            .order_by(WholesaleOrder.created_at.desc())
            .limit(3)
        )
        rows = (await db.execute(stmt)).scalars().all()
        for o in rows:
            lines.append(
                f"Wholesale order #{o.id}: status={o.status}, "
                f"payment={o.payment_status}, total=${o.total/100:.2f}"
            )
    else:
        stmt = (
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
            .limit(3)
        )
        rows = (await db.execute(stmt)).scalars().all()
        for o in rows:
            lines.append(
                f"Order #{o.id}: status={o.status}, total=${o.total/100:.2f}"
            )
    if not lines:
        return "No recent orders on file."
    return "Recent orders (last 3, status only — no PII):\n" + "\n".join(lines)


# ---- Rate limiter (§5.4) ----
# Redis-backed, with an in-memory fallback when Redis is missing.
# Anonymous: 10 req/min per IP. Authenticated: 30 req/min per user_id.
#
# The key namespace is "ratelimit:chatbot:..." in Redis; the in-memory
# fallback uses a similar key format. The fallback degrades gracefully
# (does not 500) when Redis is unreachable.

_RATE_LIMIT_WINDOW = 60
_ANON_LIMIT = 10
_AUTH_LIMIT = 30

# In-memory fallback. Keyed by the same string we'd use in Redis.
_fallback_counts: dict[str, Deque[float]] = defaultdict(deque)


def _try_redis_incr(key: str, window: int) -> int | None:
    """Increment a Redis counter. Returns the new count, or None if
    Redis is unavailable. Sets the expiry on first increment.
    """
    try:
        from app.services.redis_client import get_redis  # local import to avoid hard dep
        import asyncio

        async def _do() -> int:
            r = await get_redis()
            if r is None:
                return -1  # signal "no redis"
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, window)
            results = await pipe.execute()
            return int(results[0])

        # Run synchronously (we're in a sync handler). If the loop is
        # already running, raise — caller will fall back.
        try:
            asyncio.get_running_loop()
            # We're inside an async function already; just await.
            return None  # placeholder; real call happens in caller
        except RuntimeError:
            # No running loop. Spin one.
            return asyncio.run(_do())
    except Exception as e:
        logger.debug("rate-limit redis incr failed: %s", e)
        return None


async def _redis_incr(key: str, window: int) -> int | None:
    """Async variant of the Redis increment. Returns the new count, or
    None if Redis is unavailable. Sets the expiry on first increment.
    """
    try:
        from app.services.redis_client import get_redis
        r = await get_redis()
        if r is None:
            return None
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        return int(results[0])
    except Exception as e:
        logger.debug("rate-limit redis incr failed: %s", e)
        return None


async def _check_rate_limit(
    *,
    client_ip: str,
    user_id: int | None,
) -> tuple[bool, str]:
    """Returns (allowed, key_used). key_used is the bucket key in
    either Redis or the in-memory fallback.
    """
    if user_id is not None:
        limit = _AUTH_LIMIT
        key_id = f"user:{user_id}"
    else:
        limit = _ANON_LIMIT
        key_id = f"ip:{client_ip}"
    redis_key = f"ratelimit:chatbot:{key_id}"

    # Try Redis first.
    count = await _redis_incr(redis_key, _RATE_LIMIT_WINDOW)
    if count is not None:
        return count <= limit, redis_key

    # Fallback: in-memory deque.
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW
    dq = _fallback_counts[redis_key]
    while dq and dq[0] < window_start:
        dq.popleft()
    if len(dq) >= limit:
        return False, redis_key
    dq.append(now)
    return True, redis_key


# ---- Fallback answer ----

FALLBACK_ANSWER = (
    "I'm sorry, our AI assistant is temporarily unavailable. "
    "For questions about shipping, returns, or sizing, please email "
    "support@modestwear.com. We typically respond within 24 hours on "
    "business days. You can also browse our help pages at /shipping "
    "and /returns for instant answers."
)


# ---- Health endpoint ----

@router.get("/health")
async def chatbot_health():
    """Readiness check: can we reach SAIA + Redis?"""
    saia_ok = bool(settings.SAIA_API_KEY)
    redis_ok = False
    try:
        from app.services.redis_client import get_redis
        r = await get_redis()
        redis_ok = r is not None
    except Exception:
        redis_ok = False
    return {"saia_configured": saia_ok, "redis_available": redis_ok}


# ---- Main chat endpoint ----

@router.post("")
async def chatbot_message(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: Optional[str] = Header(None),
    token_data=Depends(decode_token_dep),
):
    client_ip = request.client.host if request.client else "unknown"

    # Resolve user identity (for rate limiting + order lookup).
    user_id: int | None = None
    role: str = "customer"
    approved_wholesale = False
    if token_data is not None:
        user_id = token_data.user_id
        role = token_data.role
        if role == "wholesale":
            user_row = (
                await db.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            approved_wholesale = (
                user_row is not None and user_row.approved_at is not None
            )

    # Rate limit (§5.4). 30/min for auth, 10/min for anon.
    allowed, _rl_key = await _check_rate_limit(client_ip=client_ip, user_id=user_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    # Parse + validate input.
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    raw_message = (body.get("message") or "").strip()
    if not raw_message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Truncate to 500 chars (PLAN §5.2).
    if len(raw_message) > 500:
        raw_message = raw_message[:500]

    # PII strip (§5.2).
    stripped_message, pii_counts = _strip_pii(raw_message)
    pii_detected = bool(pii_counts)

    # Build the prompt bundle (§5.1).
    system_prompt, prompt_version = _build_prompt_bundle(role, approved_wholesale)

    # Order-status injection (§5.3).
    order_context = ""
    if user_id is not None and _wants_order_status(stripped_message):
        order_context = await _recent_orders_context(db, user_id, role)
        system_prompt = (
            system_prompt
            + "\n\nFor authenticated users, you may surface their recent "
            "order status (last 3 orders, status only — no PII). The "
            "following has been pre-fetched:\n"
            + order_context
        )

    # Blocked-intent redirect (§5.2).
    blocked_label = _detect_blocked_intent(stripped_message)
    if blocked_label:
        system_prompt = system_prompt + REDIRECT_NOTE

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": stripped_message},
    ]

    # Call SAIA. On any failure, return 200 with a fallback answer.
    answer: str | None = None
    error_msg: str | None = None
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=settings.SAIA_API_KEY,
            base_url=settings.SAIA_API_URL,
        )
        response = await client.chat.completions.create(
            model=settings.SAIA_MODEL,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )
        answer = response.choices[0].message.content
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        logger.warning("chatbot SAIA call failed: %s", error_msg)
        answer = FALLBACK_ANSWER

    # Refusal detection (§5.2).
    is_refusal = _detect_refusal(answer)

    # Log to DB. Always — even on fallback.
    try:
        log = ChatbotLog(
            user_id=user_id,
            session_id=x_session_id,
            question=raw_message,
            stripped_text=stripped_message if pii_detected else None,
            response=answer,
            error=error_msg,
            prompt_version=prompt_version,
            is_refusal=is_refusal,
        )
        db.add(log)
        await db.commit()
    except Exception as e:
        # Logging failure must not break the response.
        logger.warning("chatbot log write failed: %s", e)
        try:
            await db.rollback()
        except Exception:
            pass

    return {
        "response": answer,
        "sources": [],
        "prompt_version": prompt_version,
        "pii_detected": pii_detected,
        "is_refusal": is_refusal,
        "blocked_intent": blocked_label,
    }
