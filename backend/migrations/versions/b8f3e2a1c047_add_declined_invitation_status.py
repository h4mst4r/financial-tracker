"""add_declined_invitation_status

Revision ID: b8f3e2a1c047
Revises: a2064ba6d028
Create Date: 2026-06-04 12:00:00.000000

Adds 'declined' to HouseholdInvitation.status CHECK constraint.
Uses batch_alter_table (required for SQLite column constraint changes).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f3e2a1c047'
down_revision: Union[str, Sequence[str], None] = 'a2064ba6d028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add 'declined' to the invitation status CHECK constraint.

    The initial schema had no named CHECK constraint on this column, so we
    only add the new one. SQLite batch mode rebuilds the table, so this is safe.
    """
    with op.batch_alter_table('household_invitations') as batch_op:
        batch_op.create_check_constraint(
            'ck_invitation_status',
            "status IN ('pending', 'accepted', 'expired', 'cancelled', 'declined')",
        )


def downgrade() -> None:
    """Remove 'declined' from the invitation status CHECK constraint."""
    with op.batch_alter_table('household_invitations') as batch_op:
        batch_op.drop_constraint('ck_invitation_status', type_='check')
        batch_op.create_check_constraint(
            'ck_invitation_status',
            "status IN ('pending', 'accepted', 'expired', 'cancelled')",
        )
