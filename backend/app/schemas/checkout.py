from datetime import datetime

from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    shipping_address: dict = Field(..., min_length=1)
    coupon_code: str | None = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str
    total: int
