from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RefreshToken(Base):
    """Hashed refresh token, one row per issued token.

    Rotation:
        - On `/api/auth/refresh`, the presented row is revoked (revoked_at set)
          AND a new row is inserted with `replaced_by_id` pointing to the new row.
        - Both rows share the same `family_id` (a UUID generated at login/register).

    Reuse detection:
        - If a token is presented whose row already has `revoked_at` set, that is
          reuse of a leaked or stolen token. To be safe, we revoke every sibling
          row in the same family (set `revoked_at` on all rows with this
          `family_id`). This forces the legitimate user to log in again and
          produces the same outcome whether the attack succeeded once or many times.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    family_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    hashed_token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    replaced_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("refresh_tokens.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="refresh_tokens")
    replaced_by = relationship("RefreshToken", remote_side="RefreshToken.id")

    @staticmethod
    def new_family_id() -> str:
        return str(uuid.uuid4())

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None
