"""add schedule_id to trade_logs

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trade_logs', sa.Column('schedule_id', sa.Integer(), nullable=True))
    op.create_index('ix_trade_logs_schedule_id', 'trade_logs', ['schedule_id'])
    op.create_foreign_key(
        'fk_trade_logs_schedule_id',
        'trade_logs', 'schedules',
        ['schedule_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_trade_logs_schedule_id', 'trade_logs', type_='foreignkey')
    op.drop_index('ix_trade_logs_schedule_id', table_name='trade_logs')
    op.drop_column('trade_logs', 'schedule_id')
