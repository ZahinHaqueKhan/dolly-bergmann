"""phase 5: chatbot log prompt_version stripped_text is_refusal

Revision ID: 225acfdf9d4c
Revises: 10eab7b3d58c
Create Date: 2026-06-26 11:22:33.746539
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '225acfdf9d4c'
down_revision: Union[str, Sequence[str], None] = '10eab7b3d58c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chatbot_logs', sa.Column('stripped_text', sa.Text(), nullable=True))
    op.add_column('chatbot_logs', sa.Column('prompt_version', sa.String(length=32), nullable=True))
    op.add_column('chatbot_logs', sa.Column('is_refusal', sa.Boolean(), server_default='false', nullable=False))
    op.create_index(op.f('ix_chatbot_logs_is_refusal'), 'chatbot_logs', ['is_refusal'], unique=False)
    op.create_index(op.f('ix_chatbot_logs_prompt_version'), 'chatbot_logs', ['prompt_version'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_chatbot_logs_prompt_version'), table_name='chatbot_logs')
    op.drop_index(op.f('ix_chatbot_logs_is_refusal'), table_name='chatbot_logs')
    op.drop_column('chatbot_logs', 'is_refusal')
    op.drop_column('chatbot_logs', 'prompt_version')
    op.drop_column('chatbot_logs', 'stripped_text')
