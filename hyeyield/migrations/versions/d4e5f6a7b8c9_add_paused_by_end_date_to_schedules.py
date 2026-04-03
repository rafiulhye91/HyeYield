"""add paused_by_end_date to schedules

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('schedules', sa.Column('paused_by_end_date', sa.Boolean(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('schedules', 'paused_by_end_date')
