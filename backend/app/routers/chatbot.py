import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.config import settings
from app.database import get_db
from app.models.chatbot_log import ChatbotLog

router = APIRouter(prefix="/chatbot", tags=["chatbot"])

request_counts: dict[str, list[float]] = {}


class RateLimitExceeded(Exception):
    pass


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


@router.post("")
async def chatbot_message(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
    token_data=Depends(decode_token),
):
    client_ip = request.client.host if request.client else "unknown"

    if not check_rate_limit(client_ip, limit=10, window=60):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )

    body = await request.json()
    message = body.get("message", "")

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    user_context = None
    if token_data:
        user_context = {"user_id": token_data.user_id, "is_authenticated": True}
    else:
        user_context = {"session_id": x_session_id, "is_authenticated": False}

    import httpx

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.SAIA_API_URL}/chat",
                json={
                    "message": message,
                    "context": user_context,
                },
                headers={"Authorization": f"Bearer {settings.SAIA_API_KEY}"},
                timeout=30.0,
            )
            response.raise_for_status()
            saia_response = response.json()

    except httpx.HTTPError as e:
        chatbot_log = ChatbotLog(
            user_id=token_data.user_id if token_data else None,
            session_id=x_session_id,
            question=message,
            response=None,
            error=str(e),
        )
        db.add(chatbot_log)
        await db.commit()

        raise HTTPException(status_code=503, detail="Chatbot service unavailable")

    if not saia_response.get("answer"):
        chatbot_log = ChatbotLog(
            user_id=token_data.user_id if token_data else None,
            session_id=x_session_id,
            question=message,
            response=None,
            error="No answer from SAIA",
        )
        db.add(chatbot_log)
        await db.commit()

    return {
        "answer": saia_response.get("answer", "I'm not sure about that."),
        "sources": saia_response.get("sources", []),
    }
