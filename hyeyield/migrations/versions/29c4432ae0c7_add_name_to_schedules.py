"""add name to schedules

Revision ID: 29c4432ae0c7
Revises: 7e6ddc346825
Create Date: 2026-03-28 20:45:32.431409

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '29c4432ae0c7'
down_revision: Union[str, None] = '7e6ddc346825'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('schedules', sa.Column('name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('schedules', 'name')
