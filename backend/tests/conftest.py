"""pytest configuration for the ModestWear backend.

We run tests against the LIVE backend on 127.0.0.1:8000 (the same
one the user manages). Tests namespace themselves via a unique
`run_id` per test, so concurrent or repeated runs don't collide.

Why not ASGITransport? The in-process ASGI app shares asyncpg
connections with the test's own event loop, which trips asyncpg's
"another operation is in progress" guard under any concurrency.
Hitting the running backend over real HTTP avoids that.

The in-memory rate-limit + chatbot state lives in the running
backend's process; tests reset it via the autouse fixture below by
reaching into the module globals.
"""
from __future__ import annotations

import os
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Force a deterministic environment for the test session.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest-only")

# Backend on 127.0.0.1:8000 — same one the user manages. We can't
# import the app here without the greenlet issue, so we hit it
# over HTTP.
API_BASE = os.environ.get("API", "http://127.0.0.1:8000")


# We import the chatbot + wholesale modules purely so we can
# clear in-memory rate-limit state. This won't talk to the DB.
import app.routers.chatbot as _chatbot_mod  # noqa: E402
import app.routers.wholesale as _wholesale_mod  # noqa: E402


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Direct DB session for tests that need to seed or inspect rows.

    Avoid using this fixture in the same test as the `client` fixture
    when possible — the running backend's connection pool and the
    test's own async session can fight over asyncpg's per-connection
    single-operation contract. For seeded rows, prefer creating them
    via the admin API (use admin_user + client) and reading them back
    via GET endpoints.
    """
    from app.database import async_session_maker
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(run_id: str) -> AsyncGenerator[AsyncClient, None]:
    # Hit the real running backend. ASGITransport would be simpler
    # but conflicts with asyncpg's per-connection single-operation
    # contract.
    #
    # We set a per-test `X-Forwarded-For` header so the auth router's
    # per-IP rate limit (5 attempts per 5 minutes) doesn't trip when
    # many tests run from 127.0.0.1. The real running backend honors
    # X-Forwarded-For (Caddy does this in prod, so it's the right
    # behavior to test against).
    async with AsyncClient(
        base_url=API_BASE,
        timeout=20.0,
        headers={"X-Forwarded-For": f"10.0.{run_id[:2]}.{run_id[2:4]}"},
    ) as c:
        yield c


@pytest.fixture
def run_id() -> str:
    """Unique per-test id, used to namespace emails / SKUs / etc."""
    return uuid.uuid4().hex[:12]


@pytest_asyncio.fixture
async def sample_user(client: AsyncClient, run_id: str) -> dict:
    """A freshly-registered customer. Returns the API response
    (which is a Token pair) and the user_id.
    """
    email = f"test-{run_id}@modestwear.test"
    body = {
        "email": email,
        "password": "TestUser1!Pass",
        "first_name": "Test",
        "last_name": "User",
    }
    r = await client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    token = r.json()
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}
    )
    assert me.status_code == 200, me.text
    return {"email": email, "token": token, "user": me.json()}


@pytest_asyncio.fixture
async def admin_user(client: AsyncClient) -> dict:
    """The seeded admin user. Login and return Token + user dict."""
    body = {"email": "admin@modestwear.test", "password": "admin_secret_password_123"}
    r = await client.post("/api/auth/login", json=body)
    assert r.status_code == 200, r.text
    token = r.json()
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}
    )
    assert me.status_code == 200, me.text
    return {"email": body["email"], "token": token, "user": me.json()}


@pytest_asyncio.fixture
async def sample_product(client, admin_user, run_id: str) -> dict:
    """A minimal product with one variant, active. Returned as a dict
    shaped like the public API response.

    Seeded via the admin API (POST /api/products) so we don't open a
    second asyncpg connection pool from the test process (which
    fights with the running backend's pool over asyncpg's
    per-connection single-operation contract).
    """
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    payload = {
        "name": f"Test Product {run_id}",
        "slug": f"test-product-{run_id}",
        "description": "A pytest-seeded product.",
        "category": f"Test Cat {run_id}",
        "images": [],
        "tags": ["test"],
        "variants": [
            {
                "size": "M",
                "color": "Black",
                "price": 1000,
                "stock": 50,
                "sku": f"TEST-{run_id}",
            }
        ],
    }
    r = await client.post("/api/products", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    # Now fetch the detail to get the variant id.
    detail = await client.get(f"/api/products/{body['slug']}")
    assert detail.status_code == 200
    d = detail.json()
    return {
        "id": d["id"],
        "slug": d["slug"],
        "name": d["name"],
        "category_id": d["category_id"],
        "variant_id": d["variants"][0]["id"],
        "variant_sku": d["variants"][0]["sku"],
        "variant_price_cents": d["variants"][0]["price"],
    }


@pytest_asyncio.fixture(autouse=True)
async def _reset_rate_limit():
    """Clear in-memory rate-limit state between tests so prior tests
    don't poison the per-IP / per-user counters.
    """
    _chatbot_mod._fallback_counts.clear()
    _wholesale_mod._quote_attempts.clear()
    yield
    _chatbot_mod._fallback_counts.clear()
    _wholesale_mod._quote_attempts.clear()
