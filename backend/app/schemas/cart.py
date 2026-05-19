from pydantic import BaseModel, Field


class CartItemCreate(BaseModel):
    variant_id: int = Field(..., gt=0)
    quantity: int = Field(default=1, gt=0)


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., gt=0)


class CartItemRead(BaseModel):
    id: int
    variant_id: int
    quantity: int
    product_name: str
    size: str
    color: str
    price: int
    subtotal: int


class CartRead(BaseModel):
    items: list[CartItemRead] = Field(default_factory=list)
    total: int = 0
    item_count: int = 0
    session_id: str | None = None
