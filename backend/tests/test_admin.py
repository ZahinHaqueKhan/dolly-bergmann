"""Admin endpoints: dashboard, chatbot logs, audit, products bulk."""
import pytest


@pytest.mark.asyncio
async def test_admin_dashboard(client, admin_user):
    r = await client.get(
        "/api/admin/dashboard",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200
    body = r.json()
    for k in (
        "total_products",
        "total_orders",
        "total_revenue",
        "low_stock_count",
        "recent_orders",
        "low_stock_products",
    ):
        assert k in body


@pytest.mark.asyncio
async def test_admin_dashboard_requires_admin(client, sample_user):
    r = await client.get(
        "/api/admin/dashboard",
        headers={"Authorization": f"Bearer {sample_user['token']['access_token']}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_audit_log(client, admin_user):
    r = await client.get(
        "/api/admin/audit",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "limit" in body
    assert "offset" in body


@pytest.mark.asyncio
async def test_admin_audit_log_filter_by_action(client, admin_user):
    r = await client.get(
        "/api/admin/audit",
        params={"action": "approve"},
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_audit_requires_admin(client, sample_user):
    r = await client.get(
        "/api/admin/audit",
        headers={"Authorization": f"Bearer {sample_user['token']['access_token']}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_chatbot_unanswered(client, admin_user):
    r = await client.get(
        "/api/admin/chatbot/unanswered",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body


@pytest.mark.asyncio
async def test_admin_chatbot_unanswered_requires_admin(client, sample_user):
    r = await client.get(
        "/api/admin/chatbot/unanswered",
        headers={"Authorization": f"Bearer {sample_user['token']['access_token']}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_bulk_active(client, admin_user, sample_product):
    """Toggle the test product inactive then back active."""
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r1 = await client.post(
        "/api/products/admin/bulk-active",
        json={"ids": [sample_product["id"]], "is_active": False},
        headers=headers,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["updated"] == 1

    r2 = await client.post(
        "/api/products/admin/bulk-active",
        json={"ids": [sample_product["id"]], "is_active": True},
        headers=headers,
    )
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_admin_bulk_active_rejects_bad_ids(client, admin_user):
    r = await client.post(
        "/api/products/admin/bulk-active",
        json={"ids": "not a list", "is_active": True},
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_admin_product_detail(client, admin_user, sample_product):
    r = await client.get(
        f"/api/products/admin/{sample_product['id']}",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200
    assert r.json()["id"] == sample_product["id"]


@pytest.mark.asyncio
async def test_admin_coupons_list(client, admin_user):
    r = await client.get(
        "/api/admin/coupons",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_admin_products_list_includes_inactive(client, admin_user):
    r = await client.get(
        "/api/products?include_inactive=1",
        headers={"Authorization": f"Bearer {admin_user['token']['access_token']}"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_coupons_requires_admin(client, sample_user):
    r = await client.get(
        "/api/admin/coupons",
        headers={"Authorization": f"Bearer {sample_user['token']['access_token']}"},
    )
    assert r.status_code == 403
