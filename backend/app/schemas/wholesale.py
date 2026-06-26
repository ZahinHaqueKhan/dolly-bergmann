"""PLAN 4.5 — B2B wholesale schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ---- Wholesale signup ----

WholesaleApplicationStatus = Literal[
    "pending", "approved", "rejected", "info_requested"
]


class WholesaleSignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    company_name: str = Field(min_length=1, max_length=200)
    tax_id: str | None = Field(default=None, max_length=80)
    country: str = Field(min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


class WholesaleApplicationRead(BaseModel):
    id: int
    user_id: int
    user_email: str
    company_name: str
    tax_id: str | None = None
    country: str
    phone: str | None = None
    website: str | None = None
    notes: str | None = None
    status: WholesaleApplicationStatus
    rejection_reason: str | None = None
    decided_by: int | None = None
    decided_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class WholesaleDecisionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


# ---- Quotes ----

QuoteStatus = Literal[
    "draft", "submitted", "sent", "accepted", "declined", "expired"
]


class QuoteLineItemInput(BaseModel):
    variant_id: int = Field(ge=1)
    quantity: int = Field(ge=1, le=100000)


class QuoteCreateRequest(BaseModel):
    # The buyer can either supply a structured cart (list of line items)
    # OR a raw CSV string. Both are accepted here; the cart is preferred.
    # CSV format: one line per item — "SKU,quantity".
    line_items: list[QuoteLineItemInput] = Field(default_factory=list)
    csv: str | None = Field(default=None, max_length=20000)
    notes: str | None = Field(default=None, max_length=2000)


class QuoteLineItemRead(BaseModel):
    id: int
    variant_id: int
    product_name: str
    product_slug: str
    size: str
    color: str
    sku: str
    quantity: int
    unit_price: int | None = None
    b2b_min_order_qty: int
    line_total: int | None = None  # quantity * unit_price, null until priced

    class Config:
        from_attributes = True


class QuoteRead(BaseModel):
    id: int
    user_id: int
    user_email: str | None = None
    user_company: str | None = None
    status: QuoteStatus
    valid_until: datetime | None = None
    shipping_cost: int
    tax: int
    notes: str | None = None
    admin_notes: str | None = None
    pdf_path: str | None = None
    created_at: datetime
    sent_at: datetime | None = None
    responded_at: datetime | None = None
    line_items: list[QuoteLineItemRead] = Field(default_factory=list)
    subtotal: int = 0
    grand_total: int = 0

    class Config:
        from_attributes = True


class QuoteUpdateRequest(BaseModel):
    # Admin-only update before sending. Each line item's unit_price is
    # supplied by id; the request is rejected if the line item id does
    # not belong to this quote.
    line_items: list[dict] | None = None
    shipping_cost: int | None = Field(default=None, ge=0)
    tax: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    admin_notes: str | None = Field(default=None, max_length=2000)
    valid_until: datetime | None = None


# ---- Wholesale order ----

WholesaleOrderStatus = Literal[
    "awaiting_payment", "paid", "processing", "shipped", "delivered", "cancelled"
]
WholesalePaymentStatus = Literal["pending", "paid", "partial"]


class WholesaleOrderRead(BaseModel):
    id: int
    quote_id: int
    user_id: int
    user_email: str | None = None
    user_company: str | None = None
    status: WholesaleOrderStatus
    payment_status: WholesalePaymentStatus
    paid_at: datetime | None = None
    tracking_number: str | None = None
    shipping_carrier: str | None = None
    total: int
    created_at: datetime
    line_items: list[QuoteLineItemRead] = Field(default_factory=list)
    shipping_cost: int = 0
    tax: int = 0
    valid_until: datetime | None = None
    pdf_path: str | None = None

    class Config:
        from_attributes = True


class WholesaleOrderStatusUpdate(BaseModel):
    status: WholesaleOrderStatus
    tracking_number: str | None = Field(default=None, max_length=120)
    shipping_carrier: str | None = Field(default=None, max_length=80)
