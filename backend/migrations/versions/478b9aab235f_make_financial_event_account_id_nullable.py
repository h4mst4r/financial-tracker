"""make_financial_event_account_id_nullable

Revision ID: 478b9aab235f
Revises: b8f3e2a1c047
Create Date: 2026-06-07 14:38:32.711050

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '478b9aab235f'
down_revision: Union[str, Sequence[str], None] = 'b8f3e2a1c047'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Make financial_events.account_id nullable."""
    with op.batch_alter_table('financial_events', schema=None) as batch_op:
        batch_op.alter_column('account_id', nullable=True)


def downgrade() -> None:
    """Revert financial_events.account_id to NOT NULL."""
    with op.batch_alter_table('financial_events', schema=None) as batch_op:
        batch_op.alter_column('account_id', nullable=False)
