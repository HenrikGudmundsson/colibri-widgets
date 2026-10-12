"""create spans

Revision ID: 7c1e5b2f9a34
Revises: 0ad8140abff5
Create Date: 2026-10-12 09:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7c1e5b2f9a34'
down_revision: Union[str, None] = '0ad8140abff5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('spans',
    sa.Column('trace_id', sa.String(), nullable=False),
    sa.Column('span_id', sa.String(), nullable=False),
    sa.Column('parent_span_id', sa.String(), nullable=True),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('scope', sa.String(), nullable=True),
    sa.Column('started_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('duration_ms', sa.Float(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('status_message', sa.String(), nullable=True),
    sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('events', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.PrimaryKeyConstraint('trace_id', 'span_id')
    )
    op.create_index('ix_spans_started_at', 'spans', ['started_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_spans_started_at', table_name='spans')
    op.drop_table('spans')
