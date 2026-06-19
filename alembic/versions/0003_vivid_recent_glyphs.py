"""categories.vivid + persons.recent_glyphs

Adds two columns folded into Story 3.1 (SCP 2026-06-19):
- `categories.vivid` (bool, NOT NULL, `server_default=false`) — per-instance full-saturation fill
  opt-in (FR-SYS-016, UX §8.2). The server_default backfills existing rows so the NOT NULL add is
  safe; the same column lands on accounts/currencies in Stories 4.1/3.5.
- `persons.recent_glyphs` (Text, nullable) — JSON list of the last-8 picked glyphs for the
  EmojiIconPicker Recent row (UX §8.3).

Revision ID: 0003_vivid_recent_glyphs
Revises: 0002_person_display_format
Create Date: 2026-06-19
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_vivid_recent_glyphs"
down_revision: str | None = "0002_person_display_format"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("vivid", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.add_column(sa.Column("recent_glyphs", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.drop_column("recent_glyphs")
    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.drop_column("vivid")
