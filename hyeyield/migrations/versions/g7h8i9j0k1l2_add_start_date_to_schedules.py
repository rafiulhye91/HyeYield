"""add_start_date_to_schedules

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'g7h8i9j0k1l2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('schedules', sa.Column('start_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('schedules', 'start_date')
