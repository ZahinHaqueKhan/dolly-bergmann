from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import settings
from app.schemas.user import TokenData, UserRole

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False


def hash_refresh_token(raw_token: str) -> str:
    """Refresh tokens are stored only as a SHA-256 hash.

    The raw token is what we hand the client. The hash is what we keep on
    disk. If the DB is compromised, an attacker still cannot mint new
    access tokens because the raw secret is gone.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def new_raw_refresh_token() -> str:
    """Cryptographically random URL-safe string for the refresh token."""
    return secrets.token_urlsafe(48)


def _encode(
    *,
    data: dict[str, Any],
    expires_delta: timedelta,
    token_type: str,
) -> tuple[str, datetime]:
    to_encode = dict(data)
    expire = datetime.utcnow() + expires_delta
    to_encode["exp"] = expire
    to_encode["iat"] = datetime.utcnow()
    to_encode["type"] = token_type
    # Refresh tokens also get a unique random `jti` (JWT ID). Without it two
    # refresh tokens issued in the same second to the same user (e.g. login
    # immediately followed by /refresh) can have identical claims and therefore
    # an identical SHA-256 hash, which violates the unique constraint on
    # refresh_tokens.hashed_token.
    if token_type == "refresh":
        to_encode["jti"] = secrets.token_urlsafe(16)
    encoded = jwt.encode(
        to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return encoded, expire


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    return _encode(
        data=data,
        expires_delta=expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        token_type="access",
    )


def create_refresh_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    return _encode(
        data=data,
        expires_delta=expires_delta
        or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        token_type="refresh",
    )


def decode_token(token: str, expected_type: str | None = None) -> TokenData | None:
    """Decode and validate a JWT.

    If `expected_type` is set, the `type` claim must match (e.g. "access" or
    "refresh"). This prevents a refresh token from being used as an access
    token and vice versa.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        return None
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        return None

    role: UserRole = payload.get("role", "customer")
    if role not in ("customer", "wholesale", "admin"):
        role = "customer"

    token_type = payload.get("type", "access")
    if expected_type is not None and token_type != expected_type:
        return None

    return TokenData(user_id=user_id, role=role, token_type=token_type)


async def decode_token_dep(
    request: Request,
    expected_type: str | None = None,
) -> TokenData | None:
    """FastAPI dependency that resolves the access token from a Bearer
    header or the `access_token` httpOnly cookie, then validates it.

    Routers that need the current user/admin role should depend on
    THIS function, not on `decode_token` directly — depending on
    `decode_token` directly causes FastAPI to auto-bind `token: str`
    as a required query param, which 422s every request.
    """
    auth = request.headers.get("authorization") or ""
    token: str | None = None
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip() or None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        return None
    return decode_token(token, expected_type=expected_type)
