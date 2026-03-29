"""add end_date to schedules

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-29
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('schedules', sa.Column('end_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('schedules', 'end_date')
