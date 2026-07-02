"""Financial-event (transaction) transport (ARCH §3.6/§4.5, Story 5.1).

`POST /api/events` creates a manual transaction; `GET /api/events` lists the household's
transactions; `GET /api/events/{id}` reads one. **Any member** may create/read (contrast with the
admin/owner gate on `accounts`) — the AC is "As any member". Scoping is always `get_household_id`
(the session's household, never the body). Snake_case wire.

`GET /api/events` takes the ledger's server-side filters + sort + keyset pagination (Story 5.2,
ARCH §4.10). Inline-edit PATCH is Story 5.3.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_person, get_household_id
from backend.models.event import FinancialEvent
from backend.models.identity import Person
from backend.schemas.event import (
    TransactionCreate,
    TransactionListOut,
    TransactionResponse,
    TransactionSummary,
    response_for,
)
from backend.services import event as event_service

router = APIRouter(prefix="/api", tags=["events"])


def _to_response(event: FinancialEvent) -> TransactionResponse:
    """One transaction Response with its derived FX-source indicator (the single funnel both the
    list and single-row routes use, so the derivation never drifts)."""
    return response_for(event, amount_base_source=event_service.amount_base_source(event))


@router.get("/events")
async def list_events(
    include_archived: bool = False,
    search: str | None = None,
    date_start: date | None = None,
    date_end: date | None = None,
    category_id: str | None = None,
    type: str | None = None,
    account_id: str | None = None,
    person_id: str | None = None,
    status: str | None = None,
    gst: bool | None = None,
    reconciled: bool | None = None,
    sort: str | None = None,
    cursor: str | None = None,
    limit: int = 100,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> TransactionListOut:
    """The household's transactions (any member) with server-side filters + sort + keyset
    pagination (ARCH §4.10). `{items, total, next_cursor, summary}`. `type`/`status`/`gst` are the
    short wire names for `transaction_type`/`transaction_status`/`is_gst_claimable`."""
    rows, next_cursor, total, summary = await event_service.list_transactions(
        db,
        household_id,
        include_archived=include_archived,
        search=search,
        date_start=date_start,
        date_end=date_end,
        category_id=category_id,
        transaction_type=type,
        account_id=account_id,
        person_id=person_id,
        transaction_status=status,
        is_gst_claimable=gst,
        reconciled=reconciled,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )
    return TransactionListOut(
        items=[_to_response(e) for e in rows],
        total=total,
        next_cursor=next_cursor,
        summary=TransactionSummary(out=summary["out"], inflow=summary["inflow"]),
    )


@router.post("/events", status_code=201)
async def create_event(
    data: TransactionCreate,
    person: Person = Depends(get_current_person),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> TransactionResponse:
    """Record a transaction (**any member**; FR-E-001). Saves `transaction_status=completed`,
    `source=manual`; FX resolves per ARCH §3.2 (spot fill + optional manual base override)."""
    event = await event_service.create_transaction(db, household_id, person.id, data)
    return _to_response(event)


@router.get("/events/{event_id}")
async def get_event(
    event_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> TransactionResponse:
    """A single household-scoped transaction (any member). 404 incl. cross-household."""
    event = await event_service.get_transaction(db, household_id, event_id)
    return _to_response(event)
