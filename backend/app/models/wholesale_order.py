from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WholesaleOrder(Base):
    __tablename__ = "wholesale_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quote_id: Mapped[int] = mapped_column(
        ForeignKey("quotes.id"), nullable=False, unique=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="awaiting_payment"
    )
    payment_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="pending"
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String, nullable=True)
    shipping_carrier: Mapped[str | None] = mapped_column(String, nullable=True)
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    quote = relationship("Quote", back_populates="order")
    user = relationship("User")
