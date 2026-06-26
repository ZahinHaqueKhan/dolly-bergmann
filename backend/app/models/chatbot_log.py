from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ChatbotLog(Base):
    __tablename__ = "chatbot_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    # PLAN 5.1: text actually sent to SAIA (PII-stripped). Differs from
    # `question` when guardrails remove sensitive data.
    stripped_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # PLAN 5.1: which prompt bundle was active for this call.
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # PLAN 5.2: refusal detection. True if the response contains a
    # known refusal phrase ("I can't help", etc.).
    is_refusal: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false", index=True
    )
    # PLAN 4.7: admin marks log entries resolved after review. NULL
    # means not yet reviewed.
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    user = relationship("User", foreign_keys=[user_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])
