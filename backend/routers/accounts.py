"""Account transport (ARCH §3.5/§4.5/§4.10, Stories 4.1 + 4.2).

`GET /api/accounts` (+ optional `account_type` filter) and `GET /api/accounts/{id}` —
household-scoped reads, any member. `POST` / `PATCH` and the lifecycle routes
(`/{id}/archive`, `/{id}/restore`, `DELETE /{id}`, `/{id}/duplicate`) — admin/owner only
(`require_role("admin")`, ARCH §2.8). Scoping is always `get_household_id` (the session's
household, never the body). Snake_case wire. Responses are the §4.5 **discriminated union** (each
subtype's columns only) + the computed `can_delete`/`delete_blocked_reason` (UX §8.1).

`PUT /{id}/owners` replaces an account's owner set (Story 4.3). NOT here: value snapshots
(Story 4.4), the value-history chart (Story 4.5), transaction history (Story 4.6).
"""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.account import Account
from backend.models.identity import Person
from backend.schemas.account import (
    AccountCreate,
    AccountListOut,
    AccountOwnersUpdate,
    AccountResponse,
    AccountSnapshotCreate,
    AccountSnapshotListOut,
    AccountSnapshotResponse,
    AccountUpdate,
    response_for,
)
from backend.services import account as account_service

router = APIRouter(prefix="/api", tags=["accounts"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


async def _response_for(db: AsyncSession, household_id: str, account: Account) -> AccountResponse:
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
    return await _response_for(db, household_id, account)


@router.get("/accounts/{account_id}")
async def get_account(
    account_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """A single household-scoped account (any member). 404 incl. cross-household."""
    account = await account_service.get_account(db, household_id, account_id)
    return await _response_for(db, household_id, account)


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
    return await _response_for(db, household_id, account)


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
    return await _response_for(db, household_id, account)


@router.post("/accounts/{account_id}/restore")
async def restore_account(
    account_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Restore an archived account (admin/owner; FR-A-003). Idempotent. 404 cross-household."""
    account = await account_service.restore_account(db, household_id, person.id, account_id)
    return await _response_for(db, household_id, account)


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
    return await _response_for(db, household_id, account)


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
    return await _response_for(db, household_id, account)


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
