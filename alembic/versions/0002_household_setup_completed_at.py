"""household_setup_completed_at

Adds `households.setup_completed_at` — the persistent first-login-setup gate that replaces the
2-minute wall-clock `isFirstLogin` window (§2.14.C). NULL until the owner dismisses the New
Household modal (Save or Skip).

Revision ID: 0002_household_setup_completed_at
Revises: 0001_initial_schema
Create Date: 2026-06-29 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_household_setup_completed_at"
down_revision: str | None = "0001_initial_schema"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("households", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("setup_completed_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("households", schema=None) as batch_op:
        batch_op.drop_column("setup_completed_at")
