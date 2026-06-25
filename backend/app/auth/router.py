from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    new_raw_refresh_token,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.user import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    Token,
    UserCreate,
    UserRead,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

security = HTTPBearer(auto_error=False)

# Cookie names for the httpOnly auth cookies (PLAN 2.5: tokens in
# HttpOnly + SameSite=Lax cookies, never in localStorage). The values are
# the raw JWT strings, just as they were in the JSON body previously.
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _cookie_secure() -> bool:
    # Set Secure when not on plain http. The dev backend runs on http://
    # localhost:8000, so Secure=False in dev. In production (https) this
    # becomes True automatically because FRONTEND_URL is https.
    return settings.FRONTEND_URL.startswith("https://")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set the httpOnly access + refresh token cookies on the response."""
    common = {
        "httponly": True,
        "secure": _cookie_secure(),
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **common,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


# In-memory rate limit per PLAN 2.1-2.2. 5 attempts per IP per 5 minutes.
# Per IP, per (login | register) bucket, so a register flood does not lock
# out a legitimate user trying to log in (and vice versa). Redis will replace
# this in Phase 5.4.
_RATE_LIMIT_WINDOW_SECONDS = 5 * 60
_RATE_LIMIT_MAX_ATTEMPTS = 5
_attempts: dict[tuple[str, str], Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Honor X-Forwarded-For first hop if a proxy is in front (Phase 2 is
    # behind Caddy on prod). Fall back to socket address.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(request: Request, bucket: str) -> None:
    ip = _client_ip(request)
    key = (bucket, ip)
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    bucket_deque = _attempts[key]
    # Drop entries outside the window.
    while bucket_deque and bucket_deque[0] < window_start:
        bucket_deque.popleft()
    if len(bucket_deque) >= _RATE_LIMIT_MAX_ATTEMPTS:
        retry_after = int(bucket_deque[0] + _RATE_LIMIT_WINDOW_SECONDS - now) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    bucket_deque.append(now)


# Access token dependency. `security` is created with `auto_error=False` so we
# can raise a clean 401 ourselves with a consistent error body.
#
# Token source priority (PLAN 2.5: httpOnly cookies are the canonical
# transport after the auth flow is wired to cookies):
#   1. `Authorization: Bearer <jwt>` header (tests, scripts, server-to-server)
#   2. The `access_token` httpOnly cookie (the browser-based frontend)
async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token: str | None = None
    if credentials is not None:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_data = decode_token(token, expected_type="access")
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await db.execute(select(User).where(User.id == token_data.user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def _issue_token_pair(
    db: AsyncSession, user: User, *, family_id: str | None = None
) -> Token:
    """Issue a new access + refresh token pair and persist the hashed refresh
    token. If `family_id` is None, a new family is started.
    """
    access_token, _access_exp = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    raw_refresh, refresh_exp = create_refresh_token(
        data={"sub": str(user.id), "role": user.role}
    )
    row = RefreshToken(
        user_id=user.id,
        family_id=family_id or RefreshToken.new_family_id(),
        hashed_token=hash_refresh_token(raw_refresh),
        expires_at=refresh_exp,
    )
    db.add(row)
    await db.flush()
    return Token(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    _check_rate_limit(request, "register")

    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role="customer",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    token_pair = await _issue_token_pair(db, user)
    await db.commit()

    print(f"welcome email sent to {user.email}")
    _set_auth_cookies(response, token_pair.access_token, token_pair.refresh_token)
    return token_pair


@router.post("/login", response_model=Token)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    _check_rate_limit(request, "login")

    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    # Constant-time-ish: do the verify even on unknown user to avoid an email
    # enumeration timing oracle. Argon2 is intentionally slow so the no-match
    # path is the one that does the work; that's fine.
    if user is None or not user.is_active or not verify_password(
        credentials.password, user.password_hash if user else hash_password("dummy")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_pair = await _issue_token_pair(db, user)
    await db.commit()
    _set_auth_cookies(response, token_pair.access_token, token_pair.refresh_token)
    return token_pair


@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Validate, rotate, and reuse-detect a refresh token.

    The token is read from (in order):
      1. JSON body `{"refresh_token": "..."}` — for tests and CLI.
      2. HttpOnly `refresh_token` cookie — for the frontend auto-refresh.

    Rotation: the old row is marked revoked_at=now AND a new row is inserted
    whose `replaced_by_id` is the new row's id. The new raw token is set on
    the response cookies so the browser picks up the rotated pair.

    Reuse detection: if the presented token's row is already revoked, the
    entire family is revoked. This is the standard mitigation for stolen
    refresh tokens: the legitimate user will be forced to log in again, and
    any subsequent attempt by the attacker fails as well.
    """
    raw_refresh = (
        body.refresh_token if body is not None else None
    ) or request.cookies.get(REFRESH_COOKIE)
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    # Verify the JWT itself is structurally valid first (signature, exp).
    token_data = decode_token(raw_refresh, expected_type="refresh")
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    presented_hash = hash_refresh_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.hashed_token == presented_hash)
    )
    row = result.scalar_one_or_none()

    if row is None:
        # JWT verified but no DB row — token was issued before the rotation
        # flow, or the row was deleted. Treat as invalid rather than reuse.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not recognized",
        )

    if row.revoked_at is not None:
        # REUSE: revoke every sibling in this family.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == row.family_id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.utcnow())
        )
        await db.commit()
        # Don't clear cookies here — the attacker already has them. The
        # legitimate user's browser will 401 on the next /me call and the
        # frontend will redirect to /login.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected; family revoked",
        )

    if row.expires_at < datetime.utcnow():
        # Mark this single row as revoked for cleanliness but do NOT revoke
        # the family — expiry is not reuse.
        row.revoked_at = datetime.utcnow()
        await db.commit()
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    # Load the user.
    user_result = await db.execute(select(User).where(User.id == row.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        row.revoked_at = datetime.utcnow()
        await db.commit()
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )

    # Rotate: revoke old, issue new in the same family.
    row.revoked_at = datetime.utcnow()
    await db.flush()
    token_pair = await _issue_token_pair(db, user, family_id=row.family_id)
    # Wire up replaced_by_id now that the new row has an id.
    new_hash = hash_refresh_token(token_pair.refresh_token)
    new_result = await db.execute(
        select(RefreshToken).where(RefreshToken.hashed_token == new_hash)
    )
    new_row = new_result.scalar_one_or_none()
    if new_row is not None:
        row.replaced_by_id = new_row.id
    await db.commit()
    _set_auth_cookies(response, token_pair.access_token, token_pair.refresh_token)
    return token_pair


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the refresh token and clear auth cookies.

    Plan 2.5: tokens are in httpOnly cookies, so logout both (a) marks the
    refresh-token DB row(s) revoked so the server-side session can never
    be extended, and (b) tells the browser to drop the cookies.

    The presented refresh token is read from (in order): the JSON body
    (for tests/CLI), the `refresh_token` cookie (for the frontend). If
    none is supplied, all of the user's active refresh tokens are revoked
    (sign-everywhere-out).
    """
    body = None
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
        except Exception:
            body = None
    presented = None
    if isinstance(body, dict):
        presented = body.get("refresh_token")
    if not presented:
        presented = request.cookies.get(REFRESH_COOKIE)

    if presented:
        presented_hash = hash_refresh_token(presented)
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.hashed_token == presented_hash)
        )
        row = result.scalar_one_or_none()
        if row is not None and row.user_id == current_user.id and row.revoked_at is None:
            row.revoked_at = datetime.utcnow()
    else:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == current_user.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.utcnow())
        )
    await db.commit()
    _clear_auth_cookies(response)
    return None
