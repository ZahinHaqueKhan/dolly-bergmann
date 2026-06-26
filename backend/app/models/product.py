from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id"), nullable=False
    )
    images: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    meta_title: Mapped[str | None] = mapped_column(String, nullable=True)
    meta_description: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    # PLAN 4.3: bulk-action "toggle active/inactive" on the product
    # list. Default is active. Soft-delete = set is_active=False.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, server_default="true", index=True
    )
    # PLAN 4.5: B2B fields. b2b_only=True means the product is sold
    # only through the wholesale portal (not in the public B2C shop).
    # b2b_min_order_qty is the minimum quantity per variant on a quote
    # line item. 1 means no constraint.
    b2b_only: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    b2b_min_order_qty: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    category = relationship("Category", back_populates="products")
    variants = relationship(
        "Variant", back_populates="product", cascade="all, delete-orphan"
    )
