"""persons.display_currency native mode

Story 4.9 (Currency Display Toggle). `Person.display_currency` becomes a per-person display LENS:
an ISO code (convert every figure to it, display-only) OR the `'native'` sentinel (each figure in
its own account currency — the new default, ARCH §3.11 #4 / UX §8.4).

- Widen `display_currency` String(3) → String(16) so it can hold `'native'` (SQLite ignores the
  length, but the type stays honest for Postgres portability).
- Backfill every existing row to `'native'`: pre-4.9 the column was inert (account heroes always
  rendered native regardless), so resetting to `'native'` preserves the current visible behaviour
  AND makes the spec default real for everyone.

Revision ID: 0007_person_display_currency_native
Revises: 0006_account_currency
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_person_display_currency_native"
down_revision: str | None = "0006_account_currency"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.alter_column(
            "display_currency",
            existing_type=sa.String(3),
            type_=sa.String(16),
            existing_nullable=False,
        )
    # ponytail: display_currency was inert pre-4.9 (heroes were always native) — reset all to
    # 'native' so the spec default holds and nothing visible changes.
    op.execute("UPDATE persons SET display_currency = 'native'")


def downgrade() -> None:
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.alter_column(
            "display_currency",
            existing_type=sa.String(16),
            type_=sa.String(3),
            existing_nullable=False,
        )
