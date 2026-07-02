"""drop is_gift

Removes the dead `financial_events.is_gift` column. "Gift" is a starter tag in the free-form tag
system now (ARCH §3.7, FR-E-022) — the boolean flag was superseded and had no reader or writer. This
migration makes the schema match the model (Story 5.5).

Revision ID: 0003_drop_is_gift
Revises: 0002_household_setup_completed_at
Create Date: 2026-07-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_drop_is_gift"
down_revision: str | None = "0002_household_setup_completed_at"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("financial_events", schema=None) as batch_op:
        batch_op.drop_column("is_gift")


def downgrade() -> None:
    # Re-add as the original non-null Boolean; server_default keeps existing rows valid, mirroring the
    # 0001 column (which had no explicit server_default but was populated at insert by the model default).
    with op.batch_alter_table("financial_events", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("is_gift", sa.Boolean(), nullable=False, server_default=sa.text("0"))
        )
