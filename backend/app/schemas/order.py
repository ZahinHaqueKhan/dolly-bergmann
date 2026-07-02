from datetime import datetime

from pydantic import BaseModel, Field


class OrderItemRead(BaseModel):
    id: int
    variant_id: int
    product_name: str
    size: str
    color: str
    quantity: int
    unit_price: int
    subtotal: int


class OrderCreate(BaseModel):
    shipping_address: dict = Field(..., min_length=1)
    email: str | None = None
    coupon_code: str | None = None


class OrderRead(BaseModel):
    id: int
    status: str
    total: int
    shipping_address: dict
    stripe_payment_intent_id: str | None
    created_at: datetime
    items: list[OrderItemRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|paid|shipped|delivered|cancelled)$")
