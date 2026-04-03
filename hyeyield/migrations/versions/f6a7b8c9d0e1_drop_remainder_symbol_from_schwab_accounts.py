"""drop remainder_symbol from schwab_accounts

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('schwab_accounts', 'remainder_symbol')


def downgrade():
    op.add_column('schwab_accounts', sa.Column('remainder_symbol', sa.String(length=10), nullable=False, server_default='SPUS'))
