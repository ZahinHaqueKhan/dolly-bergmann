import os
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token_dep
from app.config import settings
from app.database import get_db
from app.models.chatbot_log import ChatbotLog
from app.models.user import User

router = APIRouter(prefix="/chatbot", tags=["chatbot"])

request_counts: dict[str, list[float]] = {}

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    p = PROMPTS_DIR / name
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8")


PRODUCT_FAQ_SYSTEM_PROMPT = """You are a knowledgeable and friendly AI assistant for ModestWear, an online modest fashion store selling dresses, khimar (headscarves), abaya, and related modest clothing.

Your role is to help customers with:
- Product information (sizes, colors, materials, fit)
- Shipping times, costs, and options
- Return and exchange policies
- Size guide and measurement assistance
- Order status (if the user is authenticated)
- General questions about modest fashion

Guidelines:
- Be respectful and helpful, especially during Ramadan or Eid
- Do NOT share any sensitive PII or payment information
- Do NOT process orders or payments directly
- Keep responses concise but informative (2-4 sentences)
- If you don't know something, say so and suggest contacting support@modestwear.com
- Always prioritize customer safety and satisfaction

The store's key policies:
- Free shipping on orders over $100
- 30-day returns
- Sizes range from XS to 2XL
- Standard delivery: 5-7 business days
- Express delivery: 2-3 business days
"""


def check_rate_limit(client_ip: str, limit: int = 10, window: int = 60) -> bool:
    current_time = time.time()
    window_start = current_time - window

    if client_ip not in request_counts:
        request_counts[client_ip] = []

    request_counts[client_ip] = [t for t in request_counts[client_ip] if t > window_start]

    if len(request_counts[client_ip]) >= limit:
        return False

    request_counts[client_ip].append(current_time)
    return True


def get_saia_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(
        api_key=settings.SAIA_API_KEY,
        base_url=settings.SAIA_API_URL,
    )


@router.post("")
async def chatbot_message(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: Optional[str] = Header(None),
    token_data=Depends(decode_token_dep),
):
    client_ip = request.client.host if request.client else "unknown"

    if not check_rate_limit(client_ip, limit=10, window=60):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    body = await request.json()
    user_message = body.get("message", "").strip()

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    if len(user_message) > 500:
        user_message = user_message[:500]

    user_context = ""
    extra_system = ""
    if token_data:
        user_context = f"The user is authenticated (user_id: {token_data.user_id})."
        # PLAN 4.5.9: load the wholesale FAQ addendum for approved
        # wholesale buyers. Pending/rejected users get the base prompt
        # only — they don't yet have access to the portal.
        if token_data.role == "wholesale":
            user_row = (
                await db.execute(
                    select(User).where(User.id == token_data.user_id)
                )
            ).scalar_one_or_none()
            if user_row is not None and user_row.approved_at is not None:
                extra_system = _load_prompt("wholesale_faq.v1.md")
    else:
        user_context = "The user is a guest (not authenticated)."

    messages = [
        {"role": "system", "content": PRODUCT_FAQ_SYSTEM_PROMPT},
        {"role": "system", "content": f"Context: {user_context}"},
    ]
    if extra_system:
        messages.append({"role": "system", "content": extra_system})
    messages.append({"role": "user", "content": user_message})

    try:
        client = get_saia_client()
        response = await client.chat.completions.create(
            model=settings.SAIA_MODEL,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )
        answer = response.choices[0].message.content

    except Exception as e:
        chatbot_log = ChatbotLog(
            user_id=token_data.user_id if token_data else None,
            session_id=x_session_id,
            question=user_message,
            response=None,
            error=str(e),
        )
        db.add(chatbot_log)
        await db.commit()

        raise HTTPException(
            status_code=503,
            detail="Chatbot service unavailable. Please try again later.",
        )

    chatbot_log = ChatbotLog(
        user_id=token_data.user_id if token_data else None,
        session_id=x_session_id,
        question=user_message,
        response=answer,
    )
    db.add(chatbot_log)
    await db.commit()

    return {
        "response": answer,
        "sources": [],
    }