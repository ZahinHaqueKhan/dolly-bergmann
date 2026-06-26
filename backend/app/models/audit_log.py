from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admin_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    # Verb (e.g. "create", "update", "delete", "approve", "reject",
    # "send", "mark_paid").
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Entity affected (e.g. "product", "order", "coupon",
    # "wholesale_application").
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # Free-form JSON payload (before/after, body summary, etc.).
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # PLAN 7.3: client context. Captured by the audit middleware.
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ua: Mapped[str | None] = mapped_column(Text, nullable=True)
    # HTTP method + path for the originating request.
    method: Mapped[str | None] = mapped_column(String(8), nullable=True)
    path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    admin_user = relationship("User")
