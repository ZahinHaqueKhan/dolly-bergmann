---
name: saia-chatbot-prompt
description: Use when editing the SAIA chatbot system prompt, adding FAQ knowledge, tuning guardrails, or reviewing unanswered-question logs in the ModestWear backend. Triggers on backend/app/routers/chatbot.py, the system prompt, rate limits, or ChatbotLog handling.
---

# SAIA Chatbot Prompt Skill

## Overview
The chatbot at `backend/app/routers/chatbot.py` uses the **SAIA API** via an OpenAI-compatible client (`AsyncOpenAI`). The system prompt is currently hardcoded as `PRODUCT_FAQ_SYSTEM_PROMPT` (lines 17–41). Rate limiting is 10 req/min per IP via an in-memory dict. All Q&A pairs are logged to `ChatbotLog`.

## When to use this skill
- Editing the system prompt
- Adding a new FAQ category (e.g., Ramadan shipping, Eid sales)
- Changing rate limit thresholds
- Reviewing unanswered questions for the admin panel
- Adding per-user context (order status) for authenticated users
- A/B testing prompt variants

## Prompt structure (current)

```python
PRODUCT_FAQ_SYSTEM_PROMPT = """You are a knowledgeable and friendly AI assistant for ModestWear, ..."""
```

This is a **string literal in source**. To make it manageable, split into:

```
backend/app/prompts/
├── product_faq.v1.md      # current prompt, versioned
├── product_faq.v2.md      # next iteration
├── system_base.md         # tone + safety rules
├── store_policies.md      # shipping, returns, sizing
└── seasonal/
    ├── ramadan.md         # loaded only Mar–Apr
    └── eid.md             # loaded only during Eid
```

Loader pattern:

```python
from pathlib import Path

def load_prompt(version: str = "v1") -> str:
    base = Path(__file__).parent / "system_base.md"
    faq = Path(__file__).parent / f"product_faq.{version}.md"
    policies = Path(__file__).parent / "store_policies.md"
    return "\n\n".join(p.read_text() for p in [base, faq, policies])
```

## Prompt authoring rules

The current prompt is well-structured. Maintain these properties:

1. **Role definition first** — who the assistant is and what it does
2. **Scope list** — what it can help with (bulleted)
3. **Guidelines** — tone, length, refusal style
4. **Guardrails** — what it must never do (PII, payments, raw order numbers)
5. **Fallback** — when uncertain, escalate to `support@modestwear.com`
6. **Key policies** — free shipping threshold, return window, size range

Keep total length under **800 tokens**. Long prompts cost latency and tokens without quality gains.

## Seasonal / A/B variants

For Ramadan/Eid, **don't edit the base prompt**. Load addenda:

```python
from datetime import date

def seasonal_addendum() -> str:
    today = date.today()
    if 2 <= today.month <= 4:  # rough Ramadan window
        return (Path(__file__).parent / "seasonal/ramadan.md").read_text()
    return ""
```

For A/B tests, use a per-user bucket from a hash of `user_id` or `session_id`:

```python
import hashlib
def prompt_version_for(user_key: str) -> str:
    h = int(hashlib.md5(user_key.encode()).hexdigest(), 16)
    return "v2" if h % 2 == 0 else "v1"
```

Log the version in `ChatbotLog` so you can compare satisfaction metrics.

## Guardrails (mandatory)

The current code truncates user input at 500 chars (line 89). Keep this. Add:

1. **PII regex strip** before sending to SAIA:
   ```python
   PII_PATTERNS = [
       r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b",  # credit card
       r"\b\d{3}-\d{2}-\d{4}\b",                       # SSN
       r"\b\S+@\S+\.\S+\b",                            # email
   ]
   ```
2. **Refusal keywords** in the response — if the model returns "I can't help with that" or similar, log and treat as low confidence.
3. **No payment actions** — the prompt already states this. Reinforce in code: if the user message matches `/(refund|chargeback|cancel.*order)/i`, prepend a system note directing to support.

## Rate limiting

The current in-memory dict (`request_counts`) is fine for single-process dev. **For production** (multi-worker uvicorn, multi-pod k8s), replace with Redis:

```python
async def check_rate_limit_redis(redis, client_ip: str, limit: int = 10, window: int = 60) -> bool:
    key = f"ratelimit:chatbot:{client_ip}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window)
    return count <= limit
```

The plan calls for Redis-backed rate limiting. The `REDIS_URL` setting already exists.

## Authenticated order-status flow

The current code adds `user_context` for authenticated users (line 92–96) but does **not** actually fetch their order. To implement:

```python
if token_data and any(kw in user_message.lower() for kw in ["my order", "where is", "tracking"]):
    from app.models.order import Order
    from sqlalchemy import select
    stmt = select(Order).where(Order.user_id == token_data.user_id).order_by(Order.created_at.desc()).limit(3)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    order_summary = "\n".join(
        f"Order #{o.id}: status={o.status}, total=${o.total/100:.2f}" for o in orders
    )
    user_context = f"{user_context}\nRecent orders:\n{order_summary}"
```

The system prompt must explicitly authorize this lookup. Add: "For authenticated users, you may surface their recent order status (last 3 orders, status only — no PII)."

## Logging for admin review

`ChatbotLog` is already written (lines 130–137). To make it usable, the admin panel should expose a `/api/admin/chatbot/unanswered` endpoint:

```python
@router.get("/admin/chatbot/unanswered")
async def unanswered(limit: int = 50):
    # response is null (errors) OR contains refusal phrase
    stmt = select(ChatbotLog).where(
        or_(ChatbotLog.error.isnot(None), ChatbotLog.response.ilike("%i can't%"))
    ).order_by(ChatbotLog.created_at.desc()).limit(limit)
```

## Things to never do

- Never put customer PII (name, email, address) in the prompt or in `metadata`.
- Never have the model call `stripe.*` or any payment function. The prompt forbids it; enforce by code path.
- Never increase `max_tokens` above 500. The current 300 is appropriate.
- Never skip logging. Every call must hit `ChatbotLog`, success or failure.
- Never embed the prompt in a route file. Always externalize to `app/prompts/`.
