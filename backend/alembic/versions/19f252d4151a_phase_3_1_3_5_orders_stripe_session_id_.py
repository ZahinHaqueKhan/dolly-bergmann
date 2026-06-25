"""phase 3.1-3.5: orders.stripe_session_id, unique index on payment_intent_id, updated_at

PLAN 3.5: add a unique index on Order.stripe_payment_intent_id so the
webhook can be safely re-driven without producing duplicate orders. Also
add a stripe_session_id column for the /order/success lookup, and an
updated_at column to track status transitions.

Revision ID: 19f252d4151a
Revises: 3ce805efad32
Create Date: 2026-06-25 23:28:58.372410

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19f252d4151a'
down_revision: Union[str, Sequence[str], None] = '3ce805efad32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'orders',
        sa.Column('stripe_session_id', sa.String(), nullable=True),
    )
    op.create_index(
        op.f('ix_orders_stripe_session_id'),
        'orders',
        ['stripe_session_id'],
        unique=True,
    )
    op.add_column(
        'orders',
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    # The model declares stripe_payment_intent_id as unique=True, but the
    # original column was created without a unique constraint. Add the
    # constraint + index now. Postgres won't be able to create a unique
    # index on a column with duplicates, so the migration will fail if
    # the DB has duplicate payment_intent_ids; the existing webhook
    # should have prevented that, but be defensive about it.
    op.create_index(
        op.f('ix_orders_stripe_payment_intent_id'),
        'orders',
        ['stripe_payment_intent_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_stripe_payment_intent_id'), table_name='orders')
    op.drop_column('orders', 'updated_at')
    op.drop_index(op.f('ix_orders_stripe_session_id'), table_name='orders')
    op.drop_column('orders', 'stripe_session_id')
