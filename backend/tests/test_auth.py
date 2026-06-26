"""Auth router: register, login, refresh rotation, /me, logout."""
import pytest


@pytest.mark.asyncio
async def test_register_creates_user_and_returns_tokens(client, run_id):
    email = f"reg-{run_id}@modestwear.test"
    r = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "TestUser1!Pass",
            "first_name": "Reg",
            "last_name": "User",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == email
    assert me.json()["role"] == "customer"


@pytest.mark.asyncio
async def test_register_409_on_duplicate_email(client, sample_user):
    r = await client.post(
        "/api/auth/register",
        json={
            "email": sample_user["email"],
            "password": "TestUser1!Pass",
            "first_name": "Dup",
            "last_name": "User",
        },
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_register_rejects_weak_password(client, run_id):
    r = await client.post(
        "/api/auth/register",
        json={
            "email": f"weak-{run_id}@modestwear.test",
            "password": "short",
            "first_name": "Weak",
            "last_name": "Pass",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_with_correct_credentials(client, sample_user):
    r = await client.post(
        "/api/auth/login",
        json={"email": sample_user["email"], "password": "TestUser1!Pass"},
    )
    assert r.status_code == 200
    assert r.json()["access_token"]


@pytest.mark.asyncio
async def test_login_with_wrong_password(client, sample_user):
    r = await client.post(
        "/api/auth/login",
        json={"email": sample_user["email"], "password": "WrongPass1!"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_401(client, run_id):
    r = await client.post(
        "/api/auth/login",
        json={"email": f"unknown-{run_id}@modestwear.test", "password": "WhatPass1!"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_unauthenticated_401(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rotates_token(client, sample_user):
    """Submitting a refresh token returns a NEW pair and revokes the
    old refresh row. The new access token must work against /me.
    """
    old_refresh = sample_user["token"]["refresh_token"]
    r = await client.post(
        "/api/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert r.status_code == 200, r.text
    new = r.json()
    # Refresh tokens always differ (they have a jti). The access
    # token's payload can be identical if the two calls land in the
    # same second, so we just check it's structurally valid and
    # works against /me.
    assert new["refresh_token"] != old_refresh
    assert new["access_token"]

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {new['access_token']}"}
    )
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_refresh_reuse_revokes_family(client, sample_user):
    """Submitting a previously-rotated refresh token must 401 and
    revoke the entire family (so the legitimate user is forced to
    log in again)."""
    old_refresh = sample_user["token"]["refresh_token"]
    # Rotate once.
    r1 = await client.post(
        "/api/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert r1.status_code == 200
    # Try to use the OLD refresh again (reuse).
    r2 = await client.post(
        "/api/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert r2.status_code == 401
    # The newly-issued refresh should also be revoked now.
    new_refresh = r1.json()["refresh_token"]
    r3 = await client.post(
        "/api/auth/refresh", json={"refresh_token": new_refresh}
    )
    assert r3.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh(client, sample_user):
    """After logout, the refresh token can no longer rotate a new pair.
    (The access token remains valid until its exp — that's a JWT
    property and is expected.)"""
    r = await client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {sample_user['token']['access_token']}"},
    )
    assert r.status_code == 204
    # The original refresh token is now revoked — refresh attempts 401.
    r2 = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": sample_user["token"]["refresh_token"]},
    )
    assert r2.status_code == 401
