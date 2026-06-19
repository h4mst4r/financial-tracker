"""person display_format

Adds the per-person `persons.display_format` preference (FR-P-009, Story 2.11). The
`server_default="DD-MM-YYYY"` backfills existing rows so the NOT NULL add is safe; the column is one
of {DD-MM-YYYY, MM-DD-YYYY, YYYY-MM-DD} (validated at the API layer, not the DB).

Revision ID: 0002_person_display_format
Revises: 0001_initial_schema
Create Date: 2026-06-19 21:41:29.511707
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_person_display_format"
down_revision: str | None = "0001_initial_schema"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "display_format",
                sa.String(length=20),
                nullable=False,
                server_default="DD-MM-YYYY",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("persons", schema=None) as batch_op:
        batch_op.drop_column("display_format")
