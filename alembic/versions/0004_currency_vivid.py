"""currencies.vivid

Adds the per-instance full-saturation fill opt-in to currencies (Story 3.5):
- `currencies.vivid` (bool, NOT NULL, `server_default=false`) — the currencies instance of the
  cross-entity vivid column (FR-SYS-016, UX §8.2). 0003 added it to `categories`; this is the
  `currencies` instance. The server_default backfills existing rows so the NOT NULL add is safe.

Revision ID: 0004_currency_vivid
Revises: 0003_vivid_recent_glyphs
Create Date: 2026-06-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_currency_vivid"
down_revision: str | None = "0003_vivid_recent_glyphs"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("currencies", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("vivid", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("currencies", schema=None) as batch_op:
        batch_op.drop_column("vivid")
