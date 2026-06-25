from pydantic import BaseModel, Field


class CartItemCreate(BaseModel):
    variant_id: int = Field(..., gt=0)
    quantity: int = Field(default=1, gt=0)


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=0)


class CartItemRead(BaseModel):
    id: int
    variant_id: int
    quantity: int
    product_name: str
    size: str
    color: str
    price: int
    subtotal: int
    stock: int
    image: str | None = None


class CartRead(BaseModel):
    items: list[CartItemRead] = Field(default_factory=list)
    total: int = 0
    item_count: int = 0
    # Echoed back to anonymous callers so the frontend can persist the
    # session id (PLAN 3.1). For logged-in users this is None.
    session_id: str | None = None
