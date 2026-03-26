"""move_app_credentials_to_user

Revision ID: 0b3ee5428402
Revises: 79e6e24c42ba
Create Date: 2026-03-26 00:48:43.636667

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b3ee5428402'
down_revision: Union[str, None] = '79e6e24c42ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to users
    op.add_column('users', sa.Column('app_key_enc', sa.String(length=512), nullable=True))
    op.add_column('users', sa.Column('app_secret_enc', sa.String(length=512), nullable=True))

    # SQLite does not support DROP COLUMN directly — use batch mode (table rebuild)
    with op.batch_alter_table('schwab_accounts') as batch_op:
        batch_op.drop_column('app_key_enc')
        batch_op.drop_column('app_secret_enc')


def downgrade() -> None:
    op.drop_column('users', 'app_key_enc')
    op.drop_column('users', 'app_secret_enc')

    with op.batch_alter_table('schwab_accounts') as batch_op:
        batch_op.add_column(sa.Column('app_key_enc', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('app_secret_enc', sa.String(length=512), nullable=True))
