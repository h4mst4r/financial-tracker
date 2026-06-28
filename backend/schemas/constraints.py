"""Shared field constraints for request (inbound) schemas — edge hardening.

Each alias bounds a field to its backing DB column (`backend/models`), so an over-long
string or over-precise Decimal is a clean **422 at the edge** instead of a Postgres
`value too long` / `numeric field overflow` **500** deeper in (SQLite silently ignores
column widths, so without these the bad value would just persist there). Response schemas
read trusted server data via `from_attributes` and are deliberately NOT constrained.

The alias names mirror the column width/precision they cap.
"""

import re
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, Field, StringConstraints

# ── Colour — a `#RRGGBB` hex string (the only colour shape the app stores/renders) ──
_HEX_RE = re.compile(r"#[0-9a-fA-F]{6}")


def _check_hex(value: str) -> str:
    if not _HEX_RE.fullmatch(value):
        raise ValueError("colour must be a #RRGGBB hex string")
    return value


# `fullmatch` also fixes the length, so no separate max_length is needed. On an Optional field
# (`Hex | None`) the validator only runs on the str branch — `None` passes straight through.
Hex = Annotated[str, AfterValidator(_check_hex)]

# ── Strings — max_length mirrors the String(N) column ──
Str3 = Annotated[str, StringConstraints(max_length=3)]  # ISO 4217 currency code
Str5 = Annotated[str, StringConstraints(max_length=5)]  # currency symbol
Str16 = Annotated[str, StringConstraints(max_length=16)]  # display_currency ('native' sentinel)
Str20 = Annotated[str, StringConstraints(max_length=20)]
Str30 = Annotated[str, StringConstraints(max_length=30)]
Str50 = Annotated[str, StringConstraints(max_length=50)]
Str64 = Annotated[str, StringConstraints(max_length=64)]  # timezone
Str100 = Annotated[str, StringConstraints(max_length=100)]
Str200 = Annotated[str, StringConstraints(max_length=200)]
Str320 = Annotated[str, StringConstraints(max_length=320)]  # email
Str500 = Annotated[str, StringConstraints(max_length=500)]  # base_url
NoteText = Annotated[str, StringConstraints(max_length=10000)]  # free-text Text columns

# ── Money / numeric — mirrors the Numeric(precision, scale) column ──
Money = Annotated[Decimal, Field(max_digits=15, decimal_places=4)]  # the ledger Numeric(15,4)
InterestRate = Annotated[Decimal, Field(max_digits=8, decimal_places=4)]  # Numeric(8,4)
AnnualFee = Annotated[Decimal, Field(max_digits=10, decimal_places=2)]  # Numeric(10,2)
# Numeric(6,4) percentages. `Pct` caps precision only (the service owns sign rules — e.g. fee_pct's
# negative→400); `RewardRate` also enforces ≥0 at the edge (reward_rate's original contract).
Pct = Annotated[Decimal, Field(max_digits=6, decimal_places=4)]
RewardRate = Annotated[Decimal, Field(ge=0, max_digits=6, decimal_places=4)]
