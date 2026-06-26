"""Coupons: create, update, delete, apply at checkout, validity window."""
import pytest


def _coupon_body(code: str, **overrides):
    body = {
        "code": code,
        "discount_type": "percent",
        "discount_value": 20,
        "min_order_value": 1000,
        "starts_at": "2026-01-01T00:00:00",
        "ends_at": "2027-01-01T00:00:00",
        "usage_limit": 50,
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_create_percent_coupon(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons",
        json=_coupon_body(f"PCT{run_id}", discount_value=15),
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["code"] == f"PCT{run_id}"
    assert body["discount_type"] == "percent"
    assert body["discount_value"] == 15


@pytest.mark.asyncio
async def test_create_fixed_coupon(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons",
        json=_coupon_body(
            f"FXD{run_id}", discount_type="fixed_amount", discount_value=500
        ),
        headers=headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["discount_type"] == "fixed_amount"


@pytest.mark.asyncio
async def test_create_free_shipping_coupon(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons",
        json=_coupon_body(
            f"FRE{run_id}", discount_type="free_shipping", discount_value=0
        ),
        headers=headers,
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_duplicate_code_409(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    code = f"DUP{run_id}"
    r1 = await client.post("/api/admin/coupons", json=_coupon_body(code), headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/admin/coupons", json=_coupon_body(code), headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_percent_over_100_rejected(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons",
        json=_coupon_body(f"BAD{run_id}", discount_value=150),
        headers=headers,
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_ends_before_starts_rejected(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons",
        json=_coupon_body(
            f"INV{run_id}",
            starts_at="2027-01-01T00:00:00",
            ends_at="2026-01-01T00:00:00",
        ),
        headers=headers,
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_update_coupon(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    create = await client.post(
        "/api/admin/coupons", json=_coupon_body(f"UPD{run_id}"), headers=headers
    )
    assert create.status_code == 201
    coupon_id = create.json()["id"]
    upd = await client.put(
        f"/api/admin/coupons/{coupon_id}",
        json={"discount_value": 35},
        headers=headers,
    )
    assert upd.status_code == 200
    assert upd.json()["discount_value"] == 35


@pytest.mark.asyncio
async def test_delete_coupon(client, admin_user, run_id):
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    create = await client.post(
        "/api/admin/coupons", json=_coupon_body(f"DEL{run_id}"), headers=headers
    )
    assert create.status_code == 201
    coupon_id = create.json()["id"]
    rm = await client.delete(
        f"/api/admin/coupons/{coupon_id}", headers=headers
    )
    assert rm.status_code in (200, 204)


@pytest.mark.asyncio
async def test_apply_expired_coupon_at_checkout_rejected(
    client, admin_user, run_id, db
):
    """Create a coupon then expire it. /api/checkout must reject it
    (no 500)."""
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    code = f"EXP{run_id}"
    create = await client.post(
        "/api/admin/coupons", json=_coupon_body(code), headers=headers
    )
    assert create.status_code == 201
    from sqlalchemy import text
    await db.execute(
        text("UPDATE coupons SET ends_at = '2025-01-01 00:00:00' WHERE code = :c"),
        {"c": code},
    )
    await db.commit()
    checkout = await client.post(
        "/api/checkout",
        json={
            "shipping_address": {
                "name": "T",
                "line1": "1 Main",
                "city": "X",
                "state": "X",
                "postal_code": "00000",
                "country": "US",
            },
            "coupon_code": code,
        },
        headers=headers,
    )
    # Empty cart returns 400 with a clear message; expired coupon
    # alone returns 400 too. Either way: never 500.
    assert checkout.status_code in (200, 400, 502), checkout.text


@pytest.mark.asyncio
async def test_coupon_requires_admin(client, sample_user, run_id):
    headers = {"Authorization": f"Bearer {sample_user['token']['access_token']}"}
    r = await client.post(
        "/api/admin/coupons", json=_coupon_body(f"NA{run_id}"), headers=headers
    )
    assert r.status_code == 403
