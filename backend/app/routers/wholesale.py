"""PLAN 4.5 — B2B wholesale endpoints.

Layout
------
- POST  /api/wholesale/signup              — create user + application, auto-login
- GET   /api/wholesale/me                  — current user + application status
- GET   /api/wholesale/quotes              — list this user's quotes
- POST  /api/wholesale/quotes              — create a new RFQ (rate-limited)
- GET   /api/wholesale/quotes/{id}         — get one quote (owner or admin)
- POST  /api/wholesale/quotes/{id}/accept  — buyer accepts priced quote
- POST  /api/wholesale/quotes/{id}/decline — buyer declines priced quote
- GET   /api/wholesale/orders              — list this user's wholesale orders
- GET   /api/wholesale/orders/{id}         — get one order

Admin (under /api/admin/wholesale/...):
- GET    /applications                     — list all applications
- GET    /applications/{id}                — get one application
- POST   /applications/{id}/approve        — approve
- POST   /applications/{id}/reject         — reject (reason required)
- POST   /applications/{id}/request-info   — set status=info_requested (note)
- GET    /quotes                            — list ALL quotes (admin)
- GET    /quotes/{id}                       — admin view
- PUT    /quotes/{id}                       — admin sets unit prices / shipping / tax
- POST   /quotes/{id}/send                  — admin marks status=sent + PDF + email
- GET    /quotes/{id}/pdf                   — serve generated PDF/HTML
- GET    /orders                            — list all wholesale orders
- GET    /orders/{id}                       — admin order detail
- POST   /orders/{id}/mark-paid             — admin marks payment_status=paid
- PUT    /orders/{id}/status                — admin updates order status (tracking)
"""
from __future__ import annotations

import csv
import io
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.service import (
    create_access_token,
    create_refresh_token,
    decode_token_dep,
    hash_password,
    hash_refresh_token,
    new_raw_refresh_token,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import RefreshToken
from app.models.product import Product
from app.models.quote import Quote, QuoteLineItem
from app.models.user import User
from app.models.variant import Variant
from app.models.wholesale_application import WholesaleApplication
from app.models.wholesale_order import WholesaleOrder
from app.schemas.user import Token, TokenData
from app.schemas.wholesale import (
    QuoteCreateRequest,
    QuoteLineItemRead,
    QuoteRead,
    QuoteUpdateRequest,
    WholesaleApplicationRead,
    WholesaleDecisionRequest,
    WholesaleOrderRead,
    WholesaleOrderStatusUpdate,
    WholesaleSignupRequest,
)
from app.services.audit import record_audit


router = APIRouter(prefix="/wholesale", tags=["wholesale"])
admin_router = APIRouter(prefix="/admin/wholesale", tags=["admin-wholesale"])


# ---- Cookie helpers (mirror auth/router.py) ----

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _cookie_secure() -> bool:
    return settings.FRONTEND_URL.startswith("https://")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
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


# ---- Authorization helpers ----


async def _load_user(
    db: AsyncSession, token_data: TokenData | None
) -> User | None:
    if token_data is None:
        return None
    return (await db.execute(select(User).where(User.id == token_data.user_id))).scalar_one_or_none()


def _require_wholesale(user: User | None) -> None:
    if user is None or user.role != "wholesale":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wholesale account required",
        )


def _require_approved(user: User | None) -> User:
    """Caller must be a wholesale user AND have approved_at set."""
    _require_wholesale(user)
    assert user is not None
    if user.approved_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wholesale application pending or rejected",
        )
    return user


def _require_admin(token_data: TokenData | None) -> TokenData:
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


# ---- Rate limit: 5 quote submissions per user per day ----

_QUOTE_RATE_WINDOW = 24 * 60 * 60  # 1 day
_QUOTE_RATE_MAX = 5
_quote_attempts: dict[int, Deque[float]] = defaultdict(deque)


def _check_quote_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    window_start = now - _QUOTE_RATE_WINDOW
    dq = _quote_attempts[user_id]
    while dq and dq[0] < window_start:
        dq.popleft()
    if len(dq) >= _QUOTE_RATE_MAX:
        retry_after = int(dq[0] + _QUOTE_RATE_WINDOW - now) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many quote submissions. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    dq.append(now)


# ---- Serializers ----


def _serialize_application(
    app: WholesaleApplication, user: User | None = None
) -> dict:
    return {
        "id": app.id,
        "user_id": app.user_id,
        "user_email": user.email if user else None,
        "company_name": app.company_name,
        "tax_id": app.tax_id,
        "country": app.country,
        "phone": app.phone,
        "website": app.website,
        "notes": app.notes,
        "status": app.status,
        "rejection_reason": app.rejection_reason,
        "decided_by": app.decided_by,
        "decided_at": app.decided_at.isoformat() if app.decided_at else None,
        "created_at": app.created_at.isoformat() if app.created_at else None,
    }


def _serialize_line_item(li: QuoteLineItem) -> dict:
    variant = li.variant
    product = variant.product if variant else None
    line_total = None
    if li.unit_price is not None:
        line_total = li.unit_price * li.quantity
    return {
        "id": li.id,
        "variant_id": li.variant_id,
        "product_name": product.name if product else "",
        "product_slug": product.slug if product else "",
        "size": variant.size if variant else "",
        "color": variant.color if variant else "",
        "sku": variant.sku if variant else "",
        "quantity": li.quantity,
        "unit_price": li.unit_price,
        "b2b_min_order_qty": product.b2b_min_order_qty if product else 1,
        "line_total": line_total,
    }


def _serialize_quote(quote: Quote, user: User | None = None) -> dict:
    line_items = [_serialize_line_item(li) for li in quote.line_items]
    priced = [li for li in line_items if li["line_total"] is not None]
    subtotal = sum(li["line_total"] for li in priced)
    grand_total = subtotal + (quote.shipping_cost or 0) + (quote.tax or 0)
    return {
        "id": quote.id,
        "user_id": quote.user_id,
        "user_email": user.email if user else None,
        "user_company": user.company_name if user else None,
        "status": quote.status,
        "valid_until": quote.valid_until.isoformat() if quote.valid_until else None,
        "shipping_cost": quote.shipping_cost,
        "tax": quote.tax,
        "notes": quote.notes,
        "admin_notes": quote.admin_notes,
        "pdf_path": quote.pdf_path,
        "created_at": quote.created_at.isoformat() if quote.created_at else None,
        "sent_at": quote.sent_at.isoformat() if quote.sent_at else None,
        "responded_at": quote.responded_at.isoformat() if quote.responded_at else None,
        "line_items": line_items,
        "subtotal": subtotal,
        "grand_total": grand_total,
    }


def _serialize_order(order: WholesaleOrder, user: User | None = None) -> dict:
    quote = order.quote
    line_items = (
        [_serialize_line_item(li) for li in quote.line_items] if quote else []
    )
    return {
        "id": order.id,
        "quote_id": order.quote_id,
        "user_id": order.user_id,
        "user_email": user.email if user else None,
        "user_company": user.company_name if user else None,
        "status": order.status,
        "payment_status": order.payment_status,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "tracking_number": order.tracking_number,
        "shipping_carrier": order.shipping_carrier,
        "total": order.total,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "line_items": line_items,
        "shipping_cost": quote.shipping_cost if quote else 0,
        "tax": quote.tax if quote else 0,
        "valid_until": quote.valid_until.isoformat() if quote and quote.valid_until else None,
        "pdf_path": quote.pdf_path if quote else None,
    }


# ---- Auth: signup / me ----


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def wholesale_signup(
    body: WholesaleSignupRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Create a wholesale user (role='wholesale') + WholesaleApplication.

    Auto-login: returns the token pair and sets the auth cookies, just like
    /api/auth/register. The user lands on /wholesale/pending until an admin
    reviews their application.
    """
    email = body.email.lower().strip()
    existing = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
        role="wholesale",
        company_name=body.company_name,
        tax_id=body.tax_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    app_row = WholesaleApplication(
        user_id=user.id,
        company_name=body.company_name,
        tax_id=body.tax_id,
        country=body.country,
        phone=body.phone,
        website=body.website,
        notes=body.notes,
        status="pending",
    )
    db.add(app_row)
    await db.flush()

    # Issue tokens (mirror _issue_token_pair in auth/router.py)
    access_token, _ = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    raw_refresh, refresh_exp = create_refresh_token(
        data={"sub": str(user.id), "role": user.role}
    )
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=RefreshToken.new_family_id(),
            hashed_token=hash_refresh_token(raw_refresh),
            expires_at=refresh_exp,
        )
    )
    await db.commit()

    print(
        f"[wholesale] signup email sent to admin — new application for {user.email} "
        f"(company={body.company_name!r}, country={body.country!r})"
    )
    _set_auth_cookies(response, access_token, raw_refresh)
    return Token(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me")
async def wholesale_me(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    """Return the current user + their application (if any)."""
    user = await _load_user(db, token_data)
    if user is None or user.role != "wholesale":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wholesale account required",
        )
    app_row = (
        await db.execute(
            select(WholesaleApplication)
            .where(WholesaleApplication.user_id == user.id)
            .order_by(WholesaleApplication.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "company_name": user.company_name,
            "tax_id": user.tax_id,
            "approved_at": user.approved_at.isoformat() if user.approved_at else None,
        },
        "application": _serialize_application(app_row, user) if app_row else None,
    }


# ---- Buyer: quote requests ----


def _parse_csv_items(csv_text: str) -> list[dict]:
    """Parse 'SKU,quantity' lines. Returns a list of {sku, quantity}.

    Headers (sku,quantity) are accepted but optional. Empty lines and
    comments (# ...) are skipped. Returns a list of dicts; the caller
    is responsible for resolving SKUs to variant_ids.
    """
    items: list[dict] = []
    reader = csv.reader(io.StringIO(csv_text))
    first = True
    for row in reader:
        if not row or all(not c.strip() for c in row):
            continue
        if row[0].strip().startswith("#"):
            continue
        if first:
            first = False
            if row[0].strip().lower() in ("sku", "variant_sku"):
                continue
        if len(row) < 2:
            raise ValueError(
                f"row {row!r} must be 'SKU,quantity'"
            )
        sku = row[0].strip()
        try:
            qty = int(row[1].strip())
        except ValueError as e:
            raise ValueError(f"row {row!r} has non-integer quantity: {row[1]!r}") from e
        if qty < 1:
            raise ValueError(f"row {row!r} has quantity < 1")
        items.append({"sku": sku, "quantity": qty})
    return items


async def _resolve_line_items(
    db: AsyncSession,
    structured: list[dict],
    csv_text: str | None,
) -> list[dict]:
    """Convert the heterogeneous request body to [{variant_id, quantity}, ...].

    Variant IDs are validated (must exist) and MOQ is enforced. Raises
    HTTPException 400 on any failure.
    """
    items: list[dict] = []
    seen: dict[int, int] = {}  # variant_id -> qty (collapse duplicates)
    for li in structured:
        seen[li.variant_id] = seen.get(li.variant_id, 0) + li.quantity
    if csv_text:
        csv_items = _parse_csv_items(csv_text)
        if not csv_items:
            raise ValueError("CSV was empty or unparseable")
        skus = [it["sku"] for it in csv_items]
        vstmt = select(Variant).where(Variant.sku.in_(skus))
        vresult = await db.execute(vstmt)
        variants = {v.sku: v for v in vresult.scalars().all()}
        missing = [s for s in skus if s not in variants]
        if missing:
            raise ValueError(f"Unknown SKUs: {', '.join(missing)}")
        for it in csv_items:
            v = variants[it["sku"]]
            seen[v.id] = seen.get(v.id, 0) + it["quantity"]

    for vid, qty in seen.items():
        items.append({"variant_id": vid, "quantity": qty})

    # Validate each variant + MOQ
    if not items:
        raise ValueError("Quote must contain at least one line item")
    vids = [it["variant_id"] for it in items]
    vstmt = (
        select(Variant)
        .options(selectinload(Variant.product))
        .where(Variant.id.in_(vids))
    )
    variants = {(v.id): v for v in (await db.execute(vstmt)).scalars().all()}
    missing = [vid for vid in vids if vid not in variants]
    if missing:
        raise ValueError(f"Unknown variant ids: {', '.join(map(str, missing))}")
    for it in items:
        v = variants[it["variant_id"]]
        moq = v.product.b2b_min_order_qty if v.product else 1
        if it["quantity"] < moq:
            raise ValueError(
                f"{v.sku}: quantity {it['quantity']} below MOQ {moq}"
            )
    return items


@router.get("/quotes", response_model=list[dict])
async def list_my_quotes(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    _require_approved(user)
    stmt = (
        select(Quote)
        .options(selectinload(Quote.line_items).selectinload(QuoteLineItem.variant).selectinload(Variant.product))
        .where(Quote.user_id == user.id)
        .order_by(Quote.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_quote(q, user) for q in rows]


@router.post("/quotes", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_quote(
    body: QuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    _require_approved(user)
    assert user is not None
    _check_quote_rate_limit(user.id)

    if not body.line_items and not body.csv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one line item (cart or CSV)",
        )

    try:
        items = await _resolve_line_items(db, body.line_items, body.csv)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    quote = Quote(
        user_id=user.id,
        status="submitted",
        notes=body.notes,
    )
    db.add(quote)
    await db.flush()
    for it in items:
        li = QuoteLineItem(
            quote_id=quote.id,
            variant_id=it["variant_id"],
            quantity=it["quantity"],
        )
        db.add(li)
    await db.commit()
    await db.refresh(quote)

    # Re-fetch with eager loads so the response matches list/get shapes.
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote.id)
        )
    ).scalar_one()

    print(
        f"[wholesale] quote RFQ received from {user.email} (company={user.company_name!r}): "
        f"quote_id={quote.id}, items={len(items)}"
    )
    return _serialize_quote(quote, user)


@router.get("/quotes/{quote_id}", response_model=dict)
async def get_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    if quote.user_id != user.id and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your quote",
        )
    return _serialize_quote(quote, user)


@router.post("/quotes/{quote_id}/accept", response_model=dict)
async def accept_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None or quote.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    if quote.status != "sent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quote is {quote.status!r}, only 'sent' quotes can be accepted",
        )
    if not all(li.unit_price is not None for li in quote.line_items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quote is not fully priced yet",
        )

    subtotal = sum((li.unit_price or 0) * li.quantity for li in quote.line_items)
    total = subtotal + (quote.shipping_cost or 0) + (quote.tax or 0)

    quote.status = "accepted"
    quote.responded_at = datetime.utcnow()
    order = WholesaleOrder(
        quote_id=quote.id,
        user_id=quote.user_id,
        status="awaiting_payment",
        payment_status="pending",
        total=total,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    print(
        f"[wholesale] quote {quote.id} ACCEPTED by {user.email} -> "
        f"order_id={order.id}, total=${total/100:.2f}"
    )
    return {
        "order_id": order.id,
        "quote_id": quote.id,
        "status": order.status,
        "payment_status": order.payment_status,
        "total": order.total,
    }


@router.post("/quotes/{quote_id}/decline", response_model=dict)
async def decline_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    quote = (
        await db.execute(select(Quote).where(Quote.id == quote_id))
    ).scalar_one_or_none()
    if quote is None or quote.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    if quote.status not in ("sent", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quote is {quote.status!r}, cannot decline",
        )
    quote.status = "declined"
    quote.responded_at = datetime.utcnow()
    await db.commit()
    print(f"[wholesale] quote {quote.id} DECLINED by {user.email}")
    return {"id": quote.id, "status": quote.status}


# ---- Buyer: wholesale orders ----


@router.get("/orders", response_model=list[dict])
async def list_my_orders(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    _require_wholesale(user)
    assert user is not None
    stmt = (
        select(WholesaleOrder)
        .options(
            selectinload(WholesaleOrder.quote)
            .selectinload(Quote.line_items)
            .selectinload(QuoteLineItem.variant)
            .selectinload(Variant.product),
        )
        .where(WholesaleOrder.user_id == user.id)
        .order_by(WholesaleOrder.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_order(o, user) for o in rows]


@router.get("/orders/{order_id}", response_model=dict)
async def get_my_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    user = await _load_user(db, token_data)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product),
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None or (order.user_id != user.id and user.role != "admin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return _serialize_order(order, user)


# ---- Admin: applications ----


@admin_router.get("/applications", response_model=list[dict])
async def admin_list_applications(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    stmt = (
        select(WholesaleApplication, User)
        .join(User, User.id == WholesaleApplication.user_id)
        .order_by(WholesaleApplication.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_serialize_application(app, user) for app, user in rows]


@admin_router.get("/applications/{app_id}", response_model=dict)
async def admin_get_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    app_row = (
        await db.execute(
            select(WholesaleApplication).where(WholesaleApplication.id == app_id)
        )
    ).scalar_one_or_none()
    if app_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    user = (
        await db.execute(select(User).where(User.id == app_row.user_id))
    ).scalar_one()
    return _serialize_application(app_row, user)


@admin_router.post("/applications/{app_id}/approve", response_model=dict)
async def admin_approve_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    admin = _require_admin(token_data)
    app_row = (
        await db.execute(
            select(WholesaleApplication).where(WholesaleApplication.id == app_id)
        )
    ).scalar_one_or_none()
    if app_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    user = (
        await db.execute(select(User).where(User.id == app_row.user_id))
    ).scalar_one()
    if app_row.status == "approved":
        return _serialize_application(app_row, user)
    app_row.status = "approved"
    app_row.decided_by = admin.user_id
    app_row.decided_at = datetime.utcnow()
    app_row.rejection_reason = None
    user.approved_at = datetime.utcnow()
    # Surface the company_name on the user record too.
    if app_row.company_name and not user.company_name:
        user.company_name = app_row.company_name
    if app_row.tax_id and not user.tax_id:
        user.tax_id = app_row.tax_id
    await record_audit(
        db,
        admin_user_id=admin.user_id,
        action="approve",
        entity_type="wholesale_application",
        entity_id=app_row.id,
        details={"user_email": user.email, "company_name": app_row.company_name},
    )
    await db.commit()
    print(
        f"[wholesale] APPROVAL email sent to {user.email} — "
        f"\"You're approved! Visit /wholesale to start shopping.\""
    )
    return _serialize_application(app_row, user)


@admin_router.post("/applications/{app_id}/reject", response_model=dict)
async def admin_reject_application(
    app_id: int,
    body: WholesaleDecisionRequest,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    admin = _require_admin(token_data)
    app_row = (
        await db.execute(
            select(WholesaleApplication).where(WholesaleApplication.id == app_id)
        )
    ).scalar_one_or_none()
    if app_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    user = (
        await db.execute(select(User).where(User.id == app_row.user_id))
    ).scalar_one()
    app_row.status = "rejected"
    app_row.decided_by = admin.user_id
    app_row.decided_at = datetime.utcnow()
    app_row.rejection_reason = body.reason or "No reason provided"
    user.approved_at = None
    await record_audit(
        db,
        admin_user_id=admin.user_id,
        action="reject",
        entity_type="wholesale_application",
        entity_id=app_row.id,
        details={"user_email": user.email, "reason": app_row.rejection_reason},
    )
    await db.commit()
    print(
        f"[wholesale] REJECTION email sent to {user.email} — reason: {app_row.rejection_reason!r}"
    )
    return _serialize_application(app_row, user)


@admin_router.post("/applications/{app_id}/request-info", response_model=dict)
async def admin_request_info(
    app_id: int,
    body: WholesaleDecisionRequest,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    admin = _require_admin(token_data)
    app_row = (
        await db.execute(
            select(WholesaleApplication).where(WholesaleApplication.id == app_id)
        )
    ).scalar_one_or_none()
    if app_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    user = (
        await db.execute(select(User).where(User.id == app_row.user_id))
    ).scalar_one()
    app_row.status = "info_requested"
    app_row.decided_by = admin.user_id
    app_row.decided_at = datetime.utcnow()
    app_row.rejection_reason = body.reason or "Please provide more information."
    await record_audit(
        db,
        admin_user_id=admin.user_id,
        action="request_info",
        entity_type="wholesale_application",
        entity_id=app_row.id,
        details={"user_email": user.email, "reason": app_row.rejection_reason},
    )
    await db.commit()
    print(
        f"[wholesale] INFO-REQUESTED email sent to {user.email} — "
        f"reason: {app_row.rejection_reason!r}"
    )
    return _serialize_application(app_row, user)


# ---- Admin: quotes ----


@admin_router.get("/quotes", response_model=list[dict])
async def admin_list_quotes(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    stmt = (
        select(Quote, User)
        .join(User, User.id == Quote.user_id)
        .options(
            selectinload(Quote.line_items)
            .selectinload(QuoteLineItem.variant)
            .selectinload(Variant.product)
        )
        .order_by(Quote.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_serialize_quote(q, user) for q, user in rows]


@admin_router.get("/quotes/{quote_id}", response_model=dict)
async def admin_get_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    user = (
        await db.execute(select(User).where(User.id == quote.user_id))
    ).scalar_one()
    return _serialize_quote(quote, user)


@admin_router.put("/quotes/{quote_id}", response_model=dict)
async def admin_update_quote(
    quote_id: int,
    body: QuoteUpdateRequest,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    if quote.status not in ("submitted", "sent"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit a {quote.status!r} quote",
        )

    if body.line_items is not None:
        # Body: [{"id": <line_item_id>, "unit_price_cents": <int>}, ...]
        li_by_id = {li.id: li for li in quote.line_items}
        for entry in body.line_items:
            try:
                li_id = int(entry["id"])
                unit_price = int(entry["unit_price_cents"])
            except (KeyError, TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="line_items entries must be {id, unit_price_cents}",
                )
            if li_id not in li_by_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"line_item {li_id} not on this quote",
                )
            if unit_price < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="unit_price_cents must be >= 0",
                )
            li_by_id[li_id].unit_price = unit_price

    if body.shipping_cost is not None:
        quote.shipping_cost = body.shipping_cost
    if body.tax is not None:
        quote.tax = body.tax
    if body.notes is not None:
        quote.notes = body.notes
    if body.admin_notes is not None:
        quote.admin_notes = body.admin_notes
    if body.valid_until is not None:
        quote.valid_until = body.valid_until

    await db.commit()
    # Re-fetch with eager loads.
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one()
    user = (
        await db.execute(select(User).where(User.id == quote.user_id))
    ).scalar_one()
    return _serialize_quote(quote, user)


# ---- Admin: PDF generation + send ----

QUOTES_DIR = Path("/tmp/modestwear_quotes")


def _format_money(cents: int) -> str:
    return f"${cents/100:,.2f}"


def _render_quote_html(quote: Quote, user: User) -> str:
    """Build the quote HTML used both as the rendered 'PDF' and as the
    download target (PLAN 4.5.5: use WeasyPrint if available, fallback to
    HTML pointed-to by pdf_path)."""
    rows_html = []
    for li in quote.line_items:
        v = li.variant
        product = v.product if v else None
        line_total = (li.unit_price or 0) * li.quantity
        rows_html.append(
            f"""
            <tr>
              <td>
                <div class='prod'>{product.name if product else ''}</div>
                <div class='sku'>SKU {v.sku if v else ''} — {v.size if v else ''} / {v.color if v else ''}</div>
              </td>
              <td class='num'>{li.quantity}</td>
              <td class='num'>{_format_money(li.unit_price) if li.unit_price is not None else '—'}</td>
              <td class='num'>{_format_money(line_total) if li.unit_price is not None else '—'}</td>
            </tr>"""
        )
    subtotal = sum((li.unit_price or 0) * li.quantity for li in quote.line_items)
    grand_total = subtotal + (quote.shipping_cost or 0) + (quote.tax or 0)
    valid_until = (
        quote.valid_until.strftime("%B %d, %Y") if quote.valid_until else "—"
    )
    sent_at = quote.sent_at.strftime("%B %d, %Y") if quote.sent_at else "—"
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<title>ModestWear Quote #{quote.id}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         color: #1c1917; background: #fafaf9; margin: 0; padding: 32px; }}
  .page {{ max-width: 820px; margin: 0 auto; background: #fff; padding: 48px;
           border: 1px solid #e7e5e4; border-radius: 12px; }}
  h1 {{ font-family: 'Playfair Display', Georgia, serif; font-size: 32px;
        font-weight: 500; margin: 0 0 8px; color: #292524; }}
  .sub {{ color: #78716c; font-size: 14px; margin-bottom: 32px; }}
  .meta {{ display: flex; gap: 32px; margin-bottom: 32px; font-size: 14px; }}
  .meta .col {{ flex: 1; }}
  .meta h3 {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
              color: #a8a29e; margin: 0 0 6px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px; }}
  th {{ text-align: left; padding: 12px 8px; border-bottom: 2px solid #e7e5e4;
        color: #78716c; font-weight: 500; font-size: 11px; text-transform: uppercase;
        letter-spacing: 0.05em; }}
  th.num {{ text-align: right; }}
  td {{ padding: 14px 8px; border-bottom: 1px solid #f5f5f4; vertical-align: top; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .prod {{ color: #292524; font-weight: 500; }}
  .sku {{ color: #a8a29e; font-size: 12px; margin-top: 2px; }}
  .totals {{ margin-left: auto; width: 320px; font-size: 14px; }}
  .totals .row {{ display: flex; justify-content: space-between; padding: 6px 0; }}
  .totals .grand {{ border-top: 2px solid #292524; margin-top: 8px; padding-top: 12px;
                     font-weight: 600; font-size: 18px; color: #292524; }}
  .footer {{ margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4;
             font-size: 12px; color: #78716c; }}
  .footer .terms {{ margin-top: 16px; }}
  .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px;
            background: #fff1f2; color: #be123c; font-size: 11px;
            text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }}
</style>
</head>
<body>
  <div class='page'>
    <span class='badge'>Wholesale Quote</span>
    <h1 style='margin-top:12px;'>Quote #{quote.id}</h1>
    <div class='sub'>Sent {sent_at} · Valid until {valid_until}</div>

    <div class='meta'>
      <div class='col'>
        <h3>From</h3>
        <div><strong>ModestWear</strong></div>
        <div>hello@modestwear.com</div>
      </div>
      <div class='col'>
        <h3>To</h3>
        <div><strong>{user.company_name or user.first_name}</strong></div>
        <div>{user.email}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class='num'>Qty</th>
          <th class='num'>Unit</th>
          <th class='num'>Line total</th>
        </tr>
      </thead>
      <tbody>
        {''.join(rows_html)}
      </tbody>
    </table>

    <div class='totals'>
      <div class='row'><span>Subtotal</span><span>{_format_money(subtotal)}</span></div>
      <div class='row'><span>Shipping</span><span>{_format_money(quote.shipping_cost)}</span></div>
      <div class='row'><span>Tax</span><span>{_format_money(quote.tax)}</span></div>
      <div class='row grand'><span>Total</span><span>{_format_money(grand_total)}</span></div>
    </div>

    <div class='footer'>
      <div class='terms'>
        Payment terms: Net-30 from invoice date via wire transfer or check.
        Lead time: 7-14 business days from payment confirmation. Shipping
        carrier: buyer-selectable. This quote is valid for 30 days.
      </div>
    </div>
  </div>
</body>
</html>"""


def _try_render_pdf(html: str, output_path: Path) -> bool:
    """Best-effort WeasyPrint render. Returns True on success.

    Per the task spec, if WeasyPrint is unavailable we fall back to
    writing the HTML file directly and pointing pdf_path at it. The
    frontend will just open the HTML in a new tab.
    """
    try:
        from weasyprint import HTML  # type: ignore
    except Exception:
        return False
    try:
        HTML(string=html).write_pdf(str(output_path))
        return True
    except Exception:
        return False


@admin_router.post("/quotes/{quote_id}/send", response_model=dict)
async def admin_send_quote(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    if quote.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot send a {quote.status!r} quote",
        )
    if not all(li.unit_price is not None for li in quote.line_items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All line items must be priced before sending",
        )
    user = (
        await db.execute(select(User).where(User.id == quote.user_id))
    ).scalar_one()

    # Default valid_until = 30 days from now.
    if quote.valid_until is None:
        quote.valid_until = datetime.utcnow() + timedelta(days=30)

    html = _render_quote_html(quote, user)
    QUOTES_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = QUOTES_DIR / f"quote-{quote.id}.html"
    pdf_path.write_text(html, encoding="utf-8")
    pdf_target = QUOTES_DIR / f"quote-{quote.id}.pdf"
    used_pdf = _try_render_pdf(html, pdf_target)
    if used_pdf:
        quote.pdf_path = f"/api/admin/wholesale/quotes/{quote.id}/pdf"
    else:
        quote.pdf_path = f"/api/admin/wholesale/quotes/{quote.id}/pdf"  # always served via the same endpoint (HTML fallback)

    quote.status = "sent"
    quote.sent_at = datetime.utcnow()
    await record_audit(
        db,
        admin_user_id=token_data.user_id or 0,
        action="send",
        entity_type="quote",
        entity_id=quote.id,
        details={"user_email": user.email, "pdf_is_real_pdf": used_pdf},
    )
    await db.commit()
    print(
        f"[wholesale] QUOTE email sent to {user.email} — "
        f"quote_id={quote.id}, valid_until={quote.valid_until.date()}, "
        f"pdf={'yes' if used_pdf else 'html-fallback'}"
    )
    return {
        "id": quote.id,
        "status": quote.status,
        "sent_at": quote.sent_at.isoformat(),
        "valid_until": quote.valid_until.isoformat(),
        "pdf_path": quote.pdf_path,
        "pdf_is_real_pdf": used_pdf,
    }


@admin_router.get("/quotes/{quote_id}/pdf")
async def admin_get_quote_pdf(
    quote_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    """Serve the quote document. Tries real PDF first, falls back to HTML."""
    _require_admin(token_data)
    quote = (
        await db.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(Quote.id == quote_id)
        )
    ).scalar_one_or_none()
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    user = (
        await db.execute(select(User).where(User.id == quote.user_id))
    ).scalar_one()
    pdf_target = QUOTES_DIR / f"quote-{quote.id}.pdf"
    if pdf_target.exists():
        return FileResponse(
            str(pdf_target),
            media_type="application/pdf",
            filename=f"quote-{quote.id}.pdf",
        )
    html = _render_quote_html(quote, user)
    return HTMLResponse(content=html)


# ---- Admin: orders ----


@admin_router.get("/orders", response_model=list[dict])
async def admin_list_orders(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    stmt = (
        select(WholesaleOrder, User)
        .join(User, User.id == WholesaleOrder.user_id)
        .options(
            selectinload(WholesaleOrder.quote)
            .selectinload(Quote.line_items)
            .selectinload(QuoteLineItem.variant)
            .selectinload(Variant.product)
        )
        .order_by(WholesaleOrder.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_serialize_order(o, user) for o, user in rows]


@admin_router.get("/orders/{order_id}", response_model=dict)
async def admin_get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product)
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    user = (
        await db.execute(select(User).where(User.id == order.user_id))
    ).scalar_one()
    return _serialize_order(order, user)


@admin_router.post("/orders/{order_id}/mark-paid", response_model=dict)
async def admin_mark_paid(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product),
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    if order.payment_status == "paid":
        user = (
            await db.execute(select(User).where(User.id == order.user_id))
        ).scalar_one()
        return _serialize_order(order, user)
    order.payment_status = "paid"
    order.paid_at = datetime.utcnow()
    # Move order to 'paid' status (per PLAN 4.5.8 — wholesale orders
    # flow awaiting_payment -> paid -> processing -> shipped -> delivered)
    if order.status == "awaiting_payment":
        order.status = "paid"
    await record_audit(
        db,
        admin_user_id=token_data.user_id or 0,
        action="mark_paid",
        entity_type="wholesale_order",
        entity_id=order.id,
        details={"total_cents": order.total},
    )
    await db.commit()
    # Re-fetch with eager loads so the serializer doesn't trigger
    # implicit IO on lazy-loaded relationships.
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product),
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one()
    user = (
        await db.execute(select(User).where(User.id == order.user_id))
    ).scalar_one()
    print(
        f"[wholesale] PAYMENT RECEIVED email sent to {user.email} — "
        f"order_id={order.id}, total=${order.total/100:.2f}"
    )
    return _serialize_order(order, user)


@admin_router.put("/orders/{order_id}/status", response_model=dict)
async def admin_update_order_status(
    order_id: int,
    body: WholesaleOrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData | None = Depends(decode_token_dep),
):
    _require_admin(token_data)
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product),
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    order.status = body.status
    if body.status == "shipped":
        if not body.tracking_number or not body.shipping_carrier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tracking_number and shipping_carrier required when marking shipped",
            )
        order.tracking_number = body.tracking_number
        order.shipping_carrier = body.shipping_carrier
    await record_audit(
        db,
        admin_user_id=token_data.user_id or 0,
        action="update_status",
        entity_type="wholesale_order",
        entity_id=order.id,
        details={
            "new_status": order.status,
            "tracking_number": order.tracking_number,
            "shipping_carrier": order.shipping_carrier,
        },
    )
    await db.commit()
    # Re-fetch with eager loads for serialization.
    order = (
        await db.execute(
            select(WholesaleOrder)
            .options(
                selectinload(WholesaleOrder.quote)
                .selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.variant)
                .selectinload(Variant.product),
            )
            .where(WholesaleOrder.id == order_id)
        )
    ).scalar_one()
    user = (
        await db.execute(select(User).where(User.id == order.user_id))
    ).scalar_one()
    return _serialize_order(order, user)
