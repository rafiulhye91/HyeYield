"""move_refresh_token_to_user

Revision ID: 7e6ddc346825
Revises: 0b3ee5428402
Create Date: 2026-03-26 18:16:10.065231

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e6ddc346825'
down_revision: Union[str, None] = '0b3ee5428402'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('refresh_token_enc', sa.String(length=1024), nullable=True))
    with op.batch_alter_table('schwab_accounts') as batch_op:
        batch_op.drop_column('refresh_token_enc')


def downgrade() -> None:
    op.drop_column('users', 'refresh_token_enc')
    with op.batch_alter_table('schwab_accounts') as batch_op:
        batch_op.add_column(sa.Column('refresh_token_enc', sa.String(length=1024), nullable=True))
