"""Account service (ARCH §3.5/§4.10, Story 4.1).

Create / read / update for the STI `accounts` table. Follows the generic-entity template (ARCH
§4.10) + the `category.py` audit pattern (validate → flush → `audit.log`). Archive/restore/delete/
duplicate are **Story 4.2** and intentionally absent here.

Accounts have **no name-uniqueness** constraint (unlike categories/currencies) — multiple "DBS"
accounts are valid. On create, the actor becomes the **sole owner** (one `account_owners` row,
`is_primary=true`); multi-owner management is Story 4.3.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account, AccountOwner
from backend.schemas.account import AccountCreate, AccountUpdate
from backend.services.audit import audit

logger = logging.getLogger(__name__)

# Which columns a PATCH may set per subtype. `AccountUpdate` is one flat schema (build-ahead, so
# Stories 4.7/4.8 need no schema change), so the service enforces discriminator integrity: a field
# foreign to the row's `account_type` (e.g. `cost_basis` on a bank) is rejected, not silently kept.
_SHARED_UPDATE_FIELDS = frozenset({"name", "institution", "notes", "colour", "vivid"})
_LEDGER_FIELDS = frozenset({"opening_balance", "opening_balance_date"})
_SUBTYPE_UPDATE_FIELDS: dict[str, frozenset[str]] = {
    "bank": _LEDGER_FIELDS
    | {"account_number", "interest_rate", "interest_frequency", "reserved_amount"},
    "credit_card": _LEDGER_FIELDS
    | {
        "credit_limit",
        "billing_day",
        "due_day",
        "reward_points",
        "annual_fee",
        "reward_type",
        "bonus_limit",
        "points_expiry",
    },
    "capital": frozenset({"investment_type", "cost_basis"}),
    "asset": frozenset({"asset_type", "registration_no", "purchase_date", "purchase_value"}),
    "insurance": frozenset(
        {
            "policy_no",
            "insurer",
            "policy_type",
            "policy_status",
            "premium_frequency",
            "coverage_death",
            "coverage_tpd",
            "coverage_ci",
            "coverage_early_ci",
            "coverage_personal_accident",
            "coverage_hospital",
            "surrender_value",
            "surrender_inquiry_date",
        }
    ),
}

# Identity/audit columns excluded from the audit snapshot (kept: status + every business column).
_SNAPSHOT_SKIP = frozenset(
    {
        "id",
        "household_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "archived",
        "archived_at",
        "archived_by",
    }
)


def _ser(value: object) -> object | None:
    """JSON-safe scalar (the audit `json.dumps` can't take Decimal/date). `account_number` masking
    is re-applied by `audit.log` at write time."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _snapshot(account: Account) -> dict:
    """Scalar audit snapshot — every business column (skips the identity/audit block)."""
    return {
        col.key: _ser(getattr(account, col.key))
        for col in account.__table__.columns
        if col.key not in _SNAPSHOT_SKIP
    }


async def create_account(
    db: AsyncSession, household_id: str, actor_id: str, data: AccountCreate
) -> Account:
    """Create an account of any subtype (AC1). The discriminated-union `data` carries only its
    subtype's columns; the rest stay NULL. Attaches the creator as the sole owner and writes a
    `create` audit row."""
    obj = Account(
        household_id=household_id,
        created_by=actor_id,
        status="active",
        **data.model_dump(),
    )
    db.add(obj)
    await db.flush()

    db.add(
        AccountOwner(
            account_id=obj.id,
            person_id=actor_id,
            is_primary=True,
            added_at=datetime.now(UTC),
        )
    )
    await db.flush()

    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="account",
        entity_id=str(obj.id),
        before=None,
        after=_snapshot(obj),
    )
    return obj


async def update_account(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str, data: AccountUpdate
) -> Account:
    """Apply a partial update (AC2) — shared fields + opening balance/date (Story 4.1) or any
    subtype column (Stories 4.7/4.8). `account_type` is immutable (absent from `AccountUpdate`).
    Refreshes `updated_by` and writes an `update` audit row (`updated_at` is `onupdate`-driven)."""
    obj = await get_or_404(db, Account, account_id, household_id=household_id)
    fields = data.model_dump(exclude_unset=True)
    allowed = _SHARED_UPDATE_FIELDS | _SUBTYPE_UPDATE_FIELDS[obj.account_type]
    foreign = set(fields) - allowed
    if foreign:
        errors.bad_request(
            "Invalid fields",
            f"{sorted(foreign)} are not valid for a {obj.account_type} account",
        )
    before = _snapshot(obj)
    for key, value in fields.items():
        setattr(obj, key, value)
    obj.updated_by = actor_id
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="account",
        entity_id=str(obj.id),
        before=before,
        after=_snapshot(obj),
    )
    return obj


async def list_accounts(
    db: AsyncSession,
    household_id: str,
    *,
    account_types: Sequence[str] | None = None,
    include_archived: bool = False,
) -> Sequence[Account]:
    """The household's accounts (active only unless `include_archived`), ordered by name. Optionally
    filtered to `account_types` (drives the four ACCOUNTS routes). Archive is Story 4.2 — today
    every row is active, but the `archived` filter is in place for that consumer."""
    stmt = select(Account).where(Account.household_id == household_id)
    if not include_archived:
        stmt = stmt.where(Account.archived.is_(False))
    if account_types:
        stmt = stmt.where(Account.account_type.in_(list(account_types)))
    stmt = stmt.order_by(func.lower(Account.name))
    return (await db.execute(stmt)).scalars().all()


async def get_account(db: AsyncSession, household_id: str, account_id: str) -> Account:
    """A single household-scoped account (404 incl. cross-household)."""
    return await get_or_404(db, Account, account_id, household_id=household_id)


async def owner_ids_for(
    db: AsyncSession, account_ids: Sequence[str]
) -> dict[str, list[str]]:
    """Map each account id → its owner person-ids in one grouped query (no N+1)."""
    if not account_ids:
        return {}
    rows = await db.execute(
        select(AccountOwner.account_id, AccountOwner.person_id).where(
            AccountOwner.account_id.in_(list(account_ids))
        )
    )
    out: dict[str, list[str]] = {}
    for account_id, person_id in rows.all():
        out.setdefault(account_id, []).append(person_id)
    return out
