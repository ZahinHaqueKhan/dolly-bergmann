from datetime import datetime

from pydantic import BaseModel, Field


class VariantCreate(BaseModel):
    size: str = Field(..., min_length=1)
    color: str = Field(..., min_length=1)
    price: int = Field(..., gt=0)
    stock: int = Field(default=0, ge=0)
    sku: str | None = None
    images: list[str] = Field(default_factory=list)


class VariantUpdate(BaseModel):
    size: str | None = Field(None, min_length=1)
    color: str | None = Field(None, min_length=1)
    price: int | None = Field(None, gt=0)
    stock: int | None = Field(None, ge=0)
    sku: str | None = None
    images: list[str] | None = None


class VariantRead(BaseModel):
    id: int
    product_id: int
    size: str
    color: str
    sku: str
    price: int
    stock: int
    images: list[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    variants: list[VariantCreate] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    meta_title: str | None = None
    meta_description: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    images: list[str] | None = None
    tags: list[str] | None = None
    meta_title: str | None = None
    meta_description: str | None = None


class ProductRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str
    category_id: int
    images: list[str]
    tags: list[str]
    meta_title: str | None
    meta_description: str | None
    created_at: datetime
    updated_at: datetime
    variants: list[VariantRead] = Field(default_factory=list)

    class Config:
        from_attributes = True
