"""Currency request/response schemas (ARCH §3.8, Story 3.5).

Generic-entity surface → **snake_case wire** (plain `BaseModel`, no `to_camel`), like
`schemas/category.py` — NOT the §2.14.C household/profile camelCase exception. The list response
follows the `{items, total}` rule (backend.md §2).

Three schemas: `CurrencyCreate` (code/name/symbol required; created non-base), `CurrencyUpdate`
(all optional — partial via `exclude_unset`; no `code`/`is_base`/`rate_to_base`/`fee_pct`),
`CurrencyResponse` (`from_attributes`, the full row so Stories 3.7/3.8 are pure additions).
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class CurrencyCreate(BaseModel):
    # No `is_base` — create is always non-base (AC2). No `rate_to_base`/`fee_pct` — the placeholder
    # rate is set by the service (real fetch is Story 3.7); fee editing is Story 3.8.
    code: str
    name: str
    symbol: str
    colour: str | None = None
    vivid: bool = False
    is_display_active: bool = True


class CurrencyUpdate(BaseModel):
    # No `code` (the UNIQUE identity is immutable after create), no `is_base` (base-change is Story
    # 3.9), no `rate_to_base` (Story 3.7), no `fee_pct` (Story 3.8). Editing the base currency's
    # name/symbol/colour/vivid is allowed; `is_base` simply isn't here so it can't be flipped.
    name: str | None = None
    symbol: str | None = None
    colour: str | None = None
    vivid: bool | None = None
    is_display_active: bool | None = None


class CurrencyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    symbol: str
    colour: str | None
    vivid: bool
    is_base: bool
    is_display_active: bool
    rate_to_base: Decimal
    fee_pct: Decimal
    last_rate_at: datetime | None
    rate_source: str | None


class CurrencyListOut(BaseModel):
    items: list[CurrencyResponse]
    total: int
