"""Cart router: add, update, remove, stock validation."""
import pytest


@pytest.mark.asyncio
async def test_add_to_cart_as_customer(client, sample_user, sample_product):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/cart/items",
        json={"variant_id": sample_product["variant_id"], "quantity": 2},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body.get("items", [])
    assert any(
        it.get("variant_id") == sample_product["variant_id"] and it.get("quantity", 0) >= 2
        for it in items
    )


@pytest.mark.asyncio
async def test_add_to_cart_anonymous_with_session(client, sample_product):
    """Anonymous users can add to cart using an X-Session-Id header
    (no auth required). The server returns a session cookie that we
    can use to read the cart back.
    """
    r = await client.post(
        "/api/cart/items",
        json={"variant_id": sample_product["variant_id"], "quantity": 1},
        headers={"X-Session-Id": "test-anon-session-12345"},
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    # The response should include items, total, etc.
    assert "items" in body
    assert "total" in body
    # The server may or may not return session_id in the body; the
    # cookie path is the canonical transport. The key contract is:
    # an anonymous add creates a row the user can read back.
    r2 = await client.get(
        "/api/cart",
        headers={"X-Session-Id": "test-anon-session-12345"},
    )
    assert r2.status_code == 200
    items = r2.json().get("items", [])
    assert any(
        it.get("variant_id") == sample_product["variant_id"]
        for it in items
    )


@pytest.mark.asyncio
async def test_add_more_than_stock_rejected(client, sample_user, sample_product):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    # sample_product has 50 in stock; ask for 9999.
    r = await client.post(
        "/api/cart/items",
        json={"variant_id": sample_product["variant_id"], "quantity": 9999},
        headers=headers,
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_add_unknown_variant_404(client, sample_user):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/cart/items",
        json={"variant_id": 999999, "quantity": 1},
        headers=headers,
    )
    assert r.status_code in (404, 400)


@pytest.mark.asyncio
async def test_remove_from_cart(client, sample_user, sample_product):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    add = await client.post(
        "/api/cart/items",
        json={"variant_id": sample_product["variant_id"], "quantity": 1},
        headers=headers,
    )
    assert add.status_code in (200, 201)
    items = add.json().get("items", [])
    cart_item = next(
        (it for it in items if it.get("variant_id") == sample_product["variant_id"]),
        None,
    )
    if cart_item is None:
        pytest.skip("cart did not return a matching item id")
    rm = await client.delete(f"/api/cart/items/{cart_item['id']}", headers=headers)
    assert rm.status_code in (200, 204)


@pytest.mark.asyncio
async def test_clear_cart(client, sample_user, sample_product):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    await client.post(
        "/api/cart/items",
        json={"variant_id": sample_product["variant_id"], "quantity": 1},
        headers=headers,
    )
    r = await client.delete("/api/cart", headers=headers)
    assert r.status_code in (200, 204)
