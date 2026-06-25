"""phase 4.1: relax coupons.valid_from to nullable, drop server_default

The Phase 4 migration kept the old `coupons.valid_from` column around
for back-compat reads, but it was still NOT NULL with a server default
of now(). Now that the model reads from `starts_at` exclusively, the
old column is purely vestigial — relax it to NULL so new admin coupon
inserts (which set `starts_at` only) don't 500 on the NOT NULL
constraint.

Revision ID: 4b1d2e3f4050
Revises: 7a2c4d9e1f30
Create Date: 2026-06-26 02:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4b1d2e3f4050"
down_revision: Union[str, Sequence[str], None] = "7a2c4d9e1f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("coupons", "valid_from", nullable=True)
    op.alter_column("coupons", "valid_from", server_default=None)


def downgrade() -> None:
    op.alter_column(
        "coupons",
        "valid_from",
        nullable=False,
        server_default=sa.text("now()"),
    )
