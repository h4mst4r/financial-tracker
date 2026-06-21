"""accounts.currency

Adds the per-account **native currency** (ISO 4217, NOT NULL) — the SCP
`sprint-change-proposal-2026-06-21-account-currency.md` foundation that was missing (Story 4.4):
- `accounts.currency` (String(3), NOT NULL) — the currency the account is denominated in.
  Existing rows predate native currency, so they are base-denominated by definition — backfilled to
  the household base code (every household has a base from Story 2.4c; `'SGD'` is a defensive
  fallback). SQLite can't add a NOT NULL column to a populated table in one step: add nullable →
  backfill → flip NOT NULL inside `batch_alter_table` (alembic recreates the table for SQLite).

Revision ID: 0006_account_currency
Revises: 0005_account_vivid
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_account_currency"
down_revision: str | None = "0005_account_vivid"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("currency", sa.String(3), nullable=True))
    # ponytail: base backfill — accounts predating native currency are base-denominated by definition.
    op.execute(
        "UPDATE accounts SET currency = COALESCE("
        "(SELECT c.code FROM currencies c "
        "WHERE c.household_id = accounts.household_id AND c.is_base = 1), 'SGD')"
    )
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.alter_column("currency", existing_type=sa.String(3), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("currency")
