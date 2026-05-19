from datetime import datetime

from pydantic import BaseModel, Field, computed_field


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    discount_type: str = Field(..., pattern="^(percent|fixed)$")
    discount_value: int = Field(..., gt=0)
    min_order_value: int = Field(default=0, ge=0)
    valid_from: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime | None = None
    usage_limit: int | None = Field(None, gt=0)


class CouponUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    discount_type: str | None = Field(None, pattern="^(percent|fixed)$")
    discount_value: int | None = Field(None, gt=0)
    min_order_value: int | None = Field(None, ge=0)
    valid_until: datetime | None = None
    usage_limit: int | None = Field(None, gt=0)


class CouponRead(BaseModel):
    id: int
    code: str
    discount_type: str
    discount_value: int
    min_order_value: int
    valid_from: datetime
    valid_until: datetime | None
    usage_limit: int | None
    used_count: int
    created_at: datetime
    is_valid: bool = True

    class Config:
        from_attributes = True

    @computed_field
    @property
    def is_valid(self) -> bool:
        now = datetime.utcnow()
        if self.valid_until and now > self.valid_until:
            return False
        if self.usage_limit and self.used_count >= self.usage_limit:
            return False
        return True
