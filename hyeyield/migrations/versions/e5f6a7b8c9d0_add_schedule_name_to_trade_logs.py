"""add schedule_name to trade_logs

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trade_logs', sa.Column('schedule_name', sa.String(length=100), nullable=True))


def downgrade():
    op.drop_column('trade_logs', 'schedule_name')
