"""Account transport (ARCH §3.5/§4.5/§4.10, Stories 4.1 + 4.2).

`GET /api/accounts` (+ optional `account_type` filter) and `GET /api/accounts/{id}` —
household-scoped reads, any member. `POST` / `PATCH` and the lifecycle routes
(`/{id}/archive`, `/{id}/restore`, `DELETE /{id}`, `/{id}/duplicate`) — admin/owner only
(`require_role("admin")`, ARCH §2.8). Scoping is always `get_household_id` (the session's
household, never the body). Snake_case wire. Responses are the §4.5 **discriminated union** (each
subtype's columns only) + the computed `can_delete`/`delete_blocked_reason` (UX §8.1).

`PUT /{id}/owners` replaces an account's owner set (Story 4.3). `GET /{id}/events` lists the
account's linked financial events (Story 4.6, FR-A-007 — empty until Epic 5 writes events). NOT
here: value snapshots (Story 4.4), the value-history chart (Story 4.5).
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.account import Account
from backend.models.identity import Person
from backend.schemas.account import (
    AccountCreate,
    AccountEventListOut,
    AccountEventResponse,
    AccountListOut,
    AccountOwnersUpdate,
    AccountResponse,
    AccountSnapshotCreate,
    AccountSnapshotListOut,
    AccountSnapshotResponse,
    AccountSnapshotUpdate,
    AccountUpdate,
    response_for,
)
from backend.services import account as account_service

router = APIRouter(prefix="/api", tags=["accounts"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


async def _to_response(db: AsyncSession, household_id: str, account: Account) -> AccountResponse:
    """Build one subtype Response with its owner ids + the computed hard-delete eligibility (UX
    §8.1). Single-row routes use this; the list route batches the scan instead (`list_accounts`)."""
    owners = await account_service.owner_ids_for(db, [account.id])
    reason = await account_service.single_delete_blocker(db, household_id, str(account.id))
    cv = await account_service.single_current_value(db, household_id, account)
    return response_for(
        account,
        owners.get(account.id, []),
        can_delete=reason is None,
        delete_blocked_reason=reason,
        current_value=cv[0] if cv else None,
        current_value_currency=cv[1] if cv else None,
    )


@router.get("/accounts")
async def list_accounts(
    account_type: list[str] | None = Query(default=None),
    include_archived: bool = False,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountListOut:
    """The household's accounts (any member; FR-A-002), ordered by name. The optional repeatable
    `account_type` filter backs the four ACCOUNTS routes; `?include_archived=true` includes archived
    rows (default lists hide them). `can_delete`/reason come from a single batched dependency scan
    (no per-row counts). `{items, total}` per the list rule."""
    accounts = await account_service.list_accounts(
        db, household_id, account_types=account_type, include_archived=include_archived
    )
    owners = await account_service.owner_ids_for(db, [a.id for a in accounts])
    blockers = await account_service.delete_blockers(db, household_id)
    current = await account_service.current_values_for(db, household_id, accounts)
    series = await account_service.value_series_for(db, household_id, accounts)
    items = []
    for a in accounts:
        cv = current.get(a.id)
        items.append(
            response_for(
                a,
                owners.get(a.id, []),
                can_delete=str(a.id) not in blockers,
                delete_blocked_reason=blockers.get(str(a.id)),
                current_value=cv[0] if cv else None,
                current_value_currency=cv[1] if cv else None,
                value_series=series.get(a.id, []),
            )
        )
    return AccountListOut(items=items, total=len(items))


@router.post("/accounts", status_code=201)
async def create_account(
    data: AccountCreate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Create an account of any subtype (admin/owner; FR-A-001). Ledger-backed types require
    `opening_balance` + `opening_balance_date` (422 otherwise). The creator becomes the
    sole owner."""
    account = await account_service.create_account(db, household_id, person.id, data)
    return await _to_response(db, household_id, account)


@router.get("/accounts/{account_id}")
async def get_account(
    account_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """A single household-scoped account (any member). 404 incl. cross-household."""
    account = await account_service.get_account(db, household_id, account_id)
    return await _to_response(db, household_id, account)


@router.patch("/accounts/{account_id}")
async def patch_account(
    account_id: str,
    data: AccountUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Edit an account (admin/owner; FR-A-002). `account_type` is immutable. 404 cross-household."""
    account = await account_service.update_account(db, household_id, person.id, account_id, data)
    return await _to_response(db, household_id, account)


@router.post("/accounts/{account_id}/archive")
async def archive_account(
    account_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Archive an account (admin/owner; FR-A-003). 200, never 409; hidden from default lists+totals,
    history preserved. Idempotent. 404 cross-household."""
    account = await account_service.archive_account(db, household_id, person.id, account_id)
    return await _to_response(db, household_id, account)


@router.post("/accounts/{account_id}/restore")
async def restore_account(
    account_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Restore an archived account (admin/owner; FR-A-003). Idempotent. 404 cross-household."""
    account = await account_service.restore_account(db, household_id, person.id, account_id)
    return await _to_response(db, household_id, account)


@router.put("/accounts/{account_id}/owners")
async def replace_account_owners(
    account_id: str,
    data: AccountOwnersUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Replace an account's owner set (admin/owner; FR-A-006). Full desired set (replace semantics);
    ≥1 owner enforced (400), every id must be a household member (400). 404 cross-household."""
    account = await account_service.replace_owners(
        db, household_id, person.id, account_id, data.owner_ids
    )
    return await _to_response(db, household_id, account)


@router.post("/accounts/{account_id}/snapshots", status_code=201)
async def create_snapshot(
    account_id: str,
    data: AccountSnapshotCreate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountSnapshotResponse:
    """Record a value snapshot (admin/owner; FR-A-014). Unknown currency → 400, system source → 422
    (both before any write). 404 cross-household."""
    snap = await account_service.create_snapshot(db, household_id, person.id, account_id, data)
    return AccountSnapshotResponse.model_validate(snap)


@router.get("/accounts/{account_id}/snapshots")
async def list_snapshots(
    account_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountSnapshotListOut:
    """An account's value snapshots, newest-first (any member; FR-A-015 seam — feeds the §8.2a modal
    header now + the Story 4.5 chart). 404 cross-household."""
    snaps = await account_service.list_snapshots(db, household_id, account_id)
    items = [AccountSnapshotResponse.model_validate(s) for s in snaps]
    return AccountSnapshotListOut(items=items, total=len(items))


@router.patch("/accounts/{account_id}/snapshots/{snapshot_id}")
async def update_snapshot(
    account_id: str,
    snapshot_id: str,
    data: AccountSnapshotUpdate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountSnapshotResponse:
    """Edit a value snapshot (admin/owner; FR-A-018). Unknown currency → 400, system source → 422
    (before any write); audited. 404 cross-household or a snapshot not on this account."""
    snap = await account_service.update_snapshot(
        db, household_id, person.id, account_id, snapshot_id, data
    )
    return AccountSnapshotResponse.model_validate(snap)


@router.delete("/accounts/{account_id}/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(
    account_id: str,
    snapshot_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete a value snapshot (admin/owner; FR-A-018). Audited; current value recomputes from the
    remaining snapshots. 404 cross-household or a snapshot not on this account."""
    await account_service.delete_snapshot(db, household_id, person.id, account_id, snapshot_id)
    return Response(status_code=204)


@router.get("/accounts/{account_id}/events")
async def list_account_events(
    account_id: str,
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountEventListOut:
    """An account's linked transaction history (any member; FR-A-007). Events where the account is
    the source **or** destination (transfer) leg (ARCH §3.6), sortable by `event_date`
    (`order=desc` default, newest-first), `limit`/`offset` paginated; `total` is the full match
    count. **Empty until Epic 5 writes events.** 404 cross-household."""
    rows, total = await account_service.list_account_events(
        db, household_id, account_id, order=order, limit=limit, offset=offset
    )
    items = [AccountEventResponse.model_validate(r) for r in rows]
    return AccountEventListOut(items=items, total=total)


@router.post("/accounts/{account_id}/duplicate", status_code=201)
async def duplicate_account(
    account_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Duplicate an account (admin/owner; FR-A-005). A new-UUID clone of all subtype fields with the
    duplicator as sole owner, `status=active`. 404 cross-household."""
    account = await account_service.duplicate_account(db, household_id, person.id, account_id)
    return await _to_response(db, household_id, account)


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete an empty account (admin/owner; FR-A-004). 204 if no events/snapshots; 409
    `has_dependencies` otherwise (the UI offers archive). 404 cross-household."""
    await account_service.delete_account(db, household_id, person.id, account_id)
    return Response(status_code=204)
