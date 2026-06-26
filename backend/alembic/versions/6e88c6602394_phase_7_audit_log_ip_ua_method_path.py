"""phase 7: audit log ip ua method path

Revision ID: 6e88c6602394
Revises: 225acfdf9d4c
Create Date: 2026-06-26 13:46:53.437363
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '6e88c6602394'
down_revision: Union[str, Sequence[str], None] = '225acfdf9d4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('ip', sa.String(length=64), nullable=True))
    op.add_column('audit_logs', sa.Column('ua', sa.Text(), nullable=True))
    op.add_column('audit_logs', sa.Column('method', sa.String(length=8), nullable=True))
    op.add_column('audit_logs', sa.Column('path', sa.String(length=512), nullable=True))
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_admin_user_id'), 'audit_logs', ['admin_user_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_entity_type'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_admin_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_column('audit_logs', 'path')
    op.drop_column('audit_logs', 'method')
    op.drop_column('audit_logs', 'ua')
    op.drop_column('audit_logs', 'ip')
