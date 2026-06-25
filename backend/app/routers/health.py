import asyncio
import logging

from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


async def _check_db() -> str:
    try:
        async with asyncio.timeout(2.0):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:
        logger.warning("health: db check failed: %s", exc)
        return "error"


async def _check_redis() -> str:
    redis_url = settings.REDIS_URL
    if not redis_url:
        return "missing"
    try:
        from redis.asyncio import from_url

        client = from_url(redis_url, socket_connect_timeout=1.5, socket_timeout=1.5)
        try:
            async with asyncio.timeout(2.0):
                pong = await client.ping()
            if pong:
                return "ok"
            return "error"
        finally:
            await client.aclose()
    except Exception as exc:
        logger.warning("health: redis check failed: %s", exc)
        return "missing"


def _check_stripe() -> str:
    return "ok" if settings.STRIPE_SECRET_KEY else "missing"


def _check_saia() -> str:
    return "ok" if settings.SAIA_API_KEY else "missing"


@router.get("/health")
async def health_check():
    db_status, redis_status, stripe_status, saia_status = await asyncio.gather(
        _check_db(),
        _check_redis(),
        asyncio.to_thread(_check_stripe),
        asyncio.to_thread(_check_saia),
    )
    return {
        "db": db_status,
        "redis": redis_status,
        "stripe": stripe_status,
        "saia": saia_status,
    }
