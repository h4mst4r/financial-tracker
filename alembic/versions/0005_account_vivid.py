"""accounts.vivid

Adds the per-instance full-saturation fill opt-in to accounts (Story 4.1):
- `accounts.vivid` (bool, NOT NULL, `server_default=false`) — the accounts instance of the
  cross-entity vivid column (FR-SYS-016, UX §8.2). 0003 added it to `categories`, 0004 to
  `currencies`; this is the `accounts` instance. The server_default backfills existing rows so the
  NOT NULL add is safe.

Revision ID: 0005_account_vivid
Revises: 0004_currency_vivid
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_account_vivid"
down_revision: str | None = "0004_currency_vivid"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("vivid", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("vivid")
