"""Currency transport (ARCH §3.8, Story 3.5).

`GET /api/currencies` + `GET /api/currencies/{id}` — household-scoped reads, any member
(FR-CU-001). `POST` / `PATCH` / `DELETE` — admin/owner only (ARCH §2.8). Scoping is always
`get_household_id` (the session's household, never the body). Currencies are flat config rows:
no archive/restore, no audit (§3.10). Snake_case wire (generic-entity surface).

Story 3.8 adds the read side of FX: each list row carries `rate_history` (the last <=12 daily
`rate_to_base` points for the MiniSparkline) and `fee_pct` is editable via PATCH.

NOT here: FX fetch (Story 3.7 — writes the rates this story reads), base-currency change
(Story 3.9), the topbar display-currency switcher (Story 9.7), the full FX-history Viewer endpoint
`GET /api/visualizations/fx-rate-history/{id}` (Epic 9).
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.identity import Person
from backend.schemas.currency import (
    CurrencyCreate,
    CurrencyListOut,
    CurrencyResponse,
    CurrencyUpdate,
)
from backend.services import currency as currency_service

router = APIRouter(prefix="/api", tags=["currencies"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


@router.get("/currencies")
async def list_currencies(
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CurrencyListOut:
    """The household's currencies as a flat list (any member; FR-CU-001). Base first, then by
    code. `{items, total}` per the list rule."""
    currencies = await currency_service.list_currencies(db, household_id)
    histories = await currency_service.list_rate_histories(db, [c.id for c in currencies])
    items = []
    for c in currencies:
        item = CurrencyResponse.model_validate(c)
        item.rate_history = histories.get(c.id, [])
        items.append(item)
    return CurrencyListOut(items=items, total=len(items))


@router.post("/currencies", status_code=201)
async def create_currency(
    data: CurrencyCreate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CurrencyResponse:
    """Add an ISO-4217 currency (admin/owner; FR-CU-002). 400 on a bad code; 409 on a duplicate
    code. Created non-base with a placeholder rate (real fetch is Story 3.7)."""
    currency = await currency_service.create_currency(db, household_id, data)
    return CurrencyResponse.model_validate(currency)


@router.get("/currencies/{currency_id}")
async def get_currency(
    currency_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CurrencyResponse:
    """A single household-scoped currency (any member). 404 incl. cross-household."""
    currency = await currency_service.get_currency(db, household_id, currency_id)
    return CurrencyResponse.model_validate(currency)


@router.patch("/currencies/{currency_id}")
async def patch_currency(
    currency_id: str,
    data: CurrencyUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> CurrencyResponse:
    """Edit a currency / toggle `is_display_active` (admin/owner; FR-CU-003). 404 cross-hh."""
    currency = await currency_service.update_currency(db, household_id, currency_id, data)
    return CurrencyResponse.model_validate(currency)


@router.delete("/currencies/{currency_id}", status_code=204)
async def delete_currency(
    currency_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete a non-base currency (admin/owner). 400 if it is the base currency; 404
    cross-household."""
    await currency_service.delete_currency(db, household_id, currency_id)
    return Response(status_code=204)
