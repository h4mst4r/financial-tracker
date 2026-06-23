"""accounts.reward_rate (cashback %)

Story 4.12 — the credit-card reward model splits by `reward_type`: points/miles keep the existing
`reward_points` (int count), cashback gets a **percentage**. Adds `accounts.reward_rate`
(Numeric(6,4), nullable) — e.g. `1.5000` = 1.5% cashback (ARCH §3.5). Nullable, no backfill:
existing cards simply have no cashback rate.

Revision ID: 0008_account_reward_rate
Revises: 0007_person_display_currency_native
Create Date: 2026-06-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_account_reward_rate"
down_revision: str | None = "0007_person_display_currency_native"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("reward_rate", sa.Numeric(6, 4), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("reward_rate")
