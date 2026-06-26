"""Redis client wrapper used by the chatbot router.

Returns None if Redis is unreachable so callers can fall back to the
in-memory rate limiter. Never raises — the absence of Redis must not
take the API down.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


_client = None
_attempted = False


async def get_redis():
    """Return an async Redis client, or None if Redis is unreachable.

    Caches the client across calls. On connection failure, returns
    None and logs a warning at most once per process.
    """
    global _client, _attempted

    if _client is not None:
        return _client

    if _attempted:
        return None
    _attempted = True

    try:
        from app.config import settings
        import redis.asyncio as aioredis

        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1.0,
            socket_timeout=1.0,
        )
        # Probe with a PING. If it fails, reset and return None.
        try:
            await _client.ping()
        except Exception as e:
            logger.info("redis unreachable at %s: %s", settings.REDIS_URL, e)
            try:
                await _client.aclose()
            except Exception:
                pass
            _client = None
            return None
        return _client
    except Exception as e:
        logger.warning("redis client init failed: %s", e)
        _client = None
        return None
