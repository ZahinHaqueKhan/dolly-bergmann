from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # PLAN 4.6: percent | fixed_amount | free_shipping.
    discount_type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # PLAN 4.6: align naming with the rest of the app. `valid_from` is
    # kept for back-compat; the canonical columns are
    # `starts_at` / `ends_at`. The migration copies valid_from -> starts_at.
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    per_user_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
