"""Wholesale router: signup, admin approval, RFQ, accept, mark paid, ship.

The full end-to-end flow is also covered by scripts/test_phase4.5.sh
at the curl level. These tests are the pytest equivalent and are
narrower per the v1.0 coverage target (60%, not 80%).
"""
import pytest


@pytest.mark.asyncio
async def test_wholesale_signup_creates_user_with_role(client, run_id):
    email = f"ws-{run_id}@modestwear.test"
    r = await client.post(
        "/api/wholesale/signup",
        json={
            "email": email,
            "password": "WholesalePass1!",
            "first_name": "WS",
            "last_name": "User",
            "company_name": f"WS Co {run_id}",
            "country": "US",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["access_token"]


@pytest.mark.asyncio
async def test_pending_buyer_blocked_from_creating_quote(client, run_id):
    email = f"ws-pend-{run_id}@modestwear.test"
    signup = await client.post(
        "/api/wholesale/signup",
        json={
            "email": email,
            "password": "WholesalePass1!",
            "first_name": "P",
            "last_name": "B",
            "company_name": "Pending Co",
            "country": "US",
        },
    )
    assert signup.status_code == 201
    token = signup.json()["access_token"]
    r = await client.post(
        "/api/wholesale/quotes",
        json={"line_items": [{"variant_id": 1, "quantity": 1}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_approve_application(client, run_id, admin_user):
    # Signup first.
    signup = await client.post(
        "/api/wholesale/signup",
        json={
            "email": f"ws-app-{run_id}@modestwear.test",
            "password": "WholesalePass1!",
            "first_name": "A",
            "last_name": "P",
            "company_name": f"Apply Co {run_id}",
            "country": "US",
        },
    )
    assert signup.status_code == 201
    # Find the application by listing the admin applications and
    # matching on the unique company name (avoids needing a db
    # session that would conflict with the live backend's pool).
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    listing = await client.get(
        "/api/admin/wholesale/applications", headers=headers
    )
    assert listing.status_code == 200
    app_id = next(
        (
            a["id"]
            for a in listing.json()
            if a.get("company_name") == f"Apply Co {run_id}"
        ),
        None,
    )
    assert app_id is not None
    r = await client.post(
        f"/api/admin/wholesale/applications/{app_id}/approve", headers=headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_approved_buyer_can_create_quote(
    client, run_id, admin_user, sample_product
):
    signup = await client.post(
        "/api/wholesale/signup",
        json={
            "email": f"ws-q-{run_id}@modestwear.test",
            "password": "WholesalePass1!",
            "first_name": "Q",
            "last_name": "B",
            "company_name": f"Quote Co {run_id}",
            "country": "US",
        },
    )
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_user['token']['access_token']}"}
    listing = await client.get(
        "/api/admin/wholesale/applications", headers=headers
    )
    app_id = next(
        (
            a["id"]
            for a in listing.json()
            if a.get("company_name") == f"Quote Co {run_id}"
        ),
        None,
    )
    assert app_id is not None
    await client.post(
        f"/api/admin/wholesale/applications/{app_id}/approve", headers=headers
    )
    r = await client.post(
        "/api/wholesale/quotes",
        json={
            "line_items": [
                {"variant_id": sample_product["variant_id"], "quantity": 6}
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "submitted"
    assert len(body["line_items"]) == 1
