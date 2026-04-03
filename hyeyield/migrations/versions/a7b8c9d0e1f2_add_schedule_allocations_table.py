"""add schedule_allocations table

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'schedule_allocations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('schedule_id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('target_pct', sa.Float(), nullable=False),
        sa.Column('display_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['schedule_id'], ['schedules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_schedule_allocations_id', 'schedule_allocations', ['id'])
    op.create_index('ix_schedule_allocations_schedule_id', 'schedule_allocations', ['schedule_id'])


def downgrade():
    op.drop_index('ix_schedule_allocations_schedule_id', table_name='schedule_allocations')
    op.drop_index('ix_schedule_allocations_id', table_name='schedule_allocations')
    op.drop_table('schedule_allocations')
