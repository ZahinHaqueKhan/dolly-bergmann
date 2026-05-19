from datetime import datetime

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    image_url: str | None = None
    parent_id: int | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    image_url: str | None = None
    parent_id: int | None = None


class CategoryRead(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    image_url: str | None
    parent_id: int | None
    created_at: datetime
    product_count: int | None = None

    class Config:
        from_attributes = True
