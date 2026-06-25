from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator


DiscountType = Literal["percent", "fixed_amount", "free_shipping"]


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    discount_type: DiscountType
    discount_value: int = Field(..., ge=0)
    min_order_value: int = Field(default=0, ge=0)
    starts_at: datetime
    ends_at: datetime | None = None
    usage_limit: int | None = Field(None, gt=0)
    per_user_limit: int | None = Field(None, gt=0)
    is_active: bool = True

    @model_validator(mode="after")
    def _check_value_for_type(self) -> "CouponCreate":
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("percent discount must be 0-100")
        if self.discount_type == "free_shipping" and self.discount_value != 0:
            raise ValueError("free_shipping coupons have discount_value=0")
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class CouponUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    discount_type: DiscountType | None = None
    discount_value: int | None = Field(None, ge=0)
    min_order_value: int | None = Field(None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    usage_limit: int | None = Field(None, gt=0)
    per_user_limit: int | None = Field(None, gt=0)
    is_active: bool | None = None


class CouponRead(BaseModel):
    id: int
    code: str
    discount_type: str
    discount_value: int
    min_order_value: int
    starts_at: datetime
    ends_at: datetime | None
    usage_limit: int | None
    per_user_limit: int | None
    used_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

    @computed_field  # type: ignore[misc]
    @property
    def is_valid(self) -> bool:
        now = datetime.utcnow()
        if not self.is_active:
            return False
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        if self.usage_limit is not None and self.used_count >= self.usage_limit:
            return False
        return True
