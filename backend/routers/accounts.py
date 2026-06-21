"""Account transport (ARCH §3.5/§4.5/§4.10, Story 4.1).

`GET /api/accounts` (+ optional `account_type` filter) and `GET /api/accounts/{id}` —
household-scoped reads, any member. `POST` / `PATCH` — admin/owner only (`require_role("admin")`,
ARCH §2.8). Scoping is always `get_household_id` (the session's household, never the body).
Snake_case wire. Responses are the §4.5 **discriminated union** (each subtype's columns only).

NOT here: archive/restore/delete/duplicate (Story 4.2), multi-owner management (Story 4.3), value
snapshots (Story 4.4), the value-history chart (Story 4.5), transaction history (Story 4.6).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.identity import Person
from backend.schemas.account import (
    AccountCreate,
    AccountListOut,
    AccountResponse,
    AccountUpdate,
    response_for,
)
from backend.services import account as account_service

router = APIRouter(prefix="/api", tags=["accounts"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_admin = require_role("admin")


@router.get("/accounts")
async def list_accounts(
    account_type: list[str] | None = Query(default=None),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountListOut:
    """The household's accounts (any member; FR-A-002), ordered by name. The optional repeatable
    `account_type` filter backs the four ACCOUNTS routes. `{items, total}` per the list rule."""
    accounts = await account_service.list_accounts(db, household_id, account_types=account_type)
    owners = await account_service.owner_ids_for(db, [a.id for a in accounts])
    items = [response_for(a, owners.get(a.id, [])) for a in accounts]
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
    return response_for(account, [person.id])


@router.get("/accounts/{account_id}")
async def get_account(
    account_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """A single household-scoped account (any member). 404 incl. cross-household."""
    account = await account_service.get_account(db, household_id, account_id)
    owners = await account_service.owner_ids_for(db, [account.id])
    return response_for(account, owners.get(account.id, []))


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
    owners = await account_service.owner_ids_for(db, [account.id])
    return response_for(account, owners.get(account.id, []))
