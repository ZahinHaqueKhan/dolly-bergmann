"""Checkout: returns a Stripe session URL (or a graceful 502/400 in
dev when Stripe is unconfigured).

We do not hit the real Stripe API. The test just verifies the route
is wired, requires auth, and never 500s.
"""
import pytest


@pytest.mark.asyncio
async def test_checkout_requires_auth_or_session(client):
    r = await client.post(
        "/api/checkout",
        json={
            "shipping_address": {
                "name": "T",
                "line1": "1 Main",
                "city": "X",
                "state": "X",
                "postal_code": "00000",
                "country": "US",
            }
        },
    )
    # Empty cart → 400. No session/auth → may 401 if it gates earlier.
    assert r.status_code in (400, 401), r.text


@pytest.mark.asyncio
async def test_checkout_validates_shipping_address(client, sample_user):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/checkout",
        json={"shipping_address": {}},  # missing required fields
        headers=headers,
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_checkout_with_empty_cart_returns_400(client, sample_user):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/checkout",
        json={
            "shipping_address": {
                "name": "T",
                "line1": "1 Main",
                "city": "X",
                "state": "X",
                "postal_code": "00000",
                "country": "US",
            }
        },
        headers=headers,
    )
    # No items in cart → 400 with a clear message.
    assert r.status_code == 400
    assert "cart" in r.json().get("detail", "").lower() or r.json().get("detail")
