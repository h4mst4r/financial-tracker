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

from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account, AccountOwner, AccountSnapshot
from backend.models.event import FinancialEvent
from backend.schemas.account import AccountCreate, AccountUpdate
from backend.services.audit import audit
from backend.services.base import assert_no_dependencies

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


def _add_primary_owner(db: AsyncSession, account_id: str, person_id: str) -> None:
    """Attach one primary `account_owners` row (the sole owner on create/duplicate; Story 4.3 adds
    more). Caller flushes."""
    db.add(
        AccountOwner(
            account_id=account_id,
            person_id=person_id,
            is_primary=True,
            added_at=datetime.now(UTC),
        )
    )


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

    _add_primary_owner(db, obj.id, actor_id)
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


# ─── Archive / restore / delete / duplicate (Story 4.2) ───


async def archive_account(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str
) -> Account:
    """Archive an account (AC1, FR-A-003) — a flat single-row flip (accounts have no parent/child
    tree, so no branch cascade unlike categories). Returns **200, never 409**. Idempotent: an
    already-archived row is a no-op (no second audit row). History (events/snapshots) is untouched;
    `list_accounts` already hides archived rows from default lists + totals."""
    obj = await get_or_404(db, Account, account_id, household_id=household_id)
    if obj.archived:
        return obj  # idempotent no-op
    before = _snapshot(obj)
    obj.status = "archived"
    obj.archived = True
    obj.archived_at = datetime.now(UTC)
    obj.archived_by = actor_id
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="archive",
        entity_type="account",
        entity_id=str(obj.id),
        before=before,
        after=_snapshot(obj),
    )
    return obj


async def restore_account(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str
) -> Account:
    """Restore an archived account (AC1, FR-A-003) — the inverse of `archive_account`. Idempotent:
    an already-active row is a no-op."""
    obj = await get_or_404(db, Account, account_id, household_id=household_id)
    if not obj.archived:
        return obj  # idempotent no-op
    before = _snapshot(obj)
    obj.status = "active"
    obj.archived = False
    obj.archived_at = None
    obj.archived_by = None
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="restore",
        entity_type="account",
        entity_id=str(obj.id),
        before=before,
        after=_snapshot(obj),
    )
    return obj


# FK referrers that BLOCK a hard delete (history that must be preserved). `account_owners` is the
# account's own ownership junction (≥1 row, always) — it is removed *with* the account in
# `delete_account`, never a blocker (FR-A-004 / Story 4.2 scope fence).
_DELETE_REFERRERS = [
    (FinancialEvent, "source_account_id"),
    (FinancialEvent, "destination_account_id"),
    (AccountSnapshot, "account_id"),
]


async def delete_account(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str
) -> None:
    """Hard-delete an account if it has zero history (AC2, FR-A-004). The dependency scan covers
    `financial_events` (both legs) + `account_snapshots`; any hit → 409 `has_dependencies` (the UI
    offers archive instead). On success the account's own `account_owners` rows are removed (the FK
    would otherwise block the delete), then the row is gone — a hard delete leaves an INFO log,
    never an audit row (services/base.py template). `actor_id` is unused (no audit) but kept for
    signature symmetry with the other lifecycle services."""
    obj = await get_or_404(db, Account, account_id, household_id=household_id)  # 404 scope guard
    await assert_no_dependencies(db, _DELETE_REFERRERS, str(account_id), entity_type="account")
    await db.execute(delete(AccountOwner).where(AccountOwner.account_id == account_id))
    await db.delete(obj)
    await db.flush()
    logger.info(
        "hard_delete_account",
        extra={"household_id": str(household_id), "entity_id": str(account_id)},
    )


async def duplicate_account(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str
) -> Account:
    """Clone an account (AC3, FR-A-005). A new-UUID row copies every business column (`account_type`
    + all subtype values + the shared fields + opening balance/date + vivid) — the `_SNAPSHOT_SKIP`
    identity/audit/lifecycle columns are NOT copied. The clone starts `status='active'` (even if the
    source is archived), with the duplicator as sole owner, and writes a `create` audit row (it is a
    new entity). The name is copied verbatim — accounts are intentionally non-unique (shared
    household accounts differ by owner/values). `account_snapshots` are NOT cloned (Story 4.4)."""
    src = await get_or_404(db, Account, account_id, household_id=household_id)
    cols = {
        col.key: getattr(src, col.key)
        for col in src.__table__.columns
        if col.key not in _SNAPSHOT_SKIP
    }
    cols["status"] = "active"  # a clone is active even if the source was archived
    clone = Account(household_id=household_id, created_by=actor_id, **cols)
    db.add(clone)
    await db.flush()

    _add_primary_owner(db, clone.id, actor_id)
    await db.flush()

    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="account",
        entity_id=str(clone.id),
        before=None,
        after=_snapshot(clone),
    )
    return clone


# ─── Delete-eligibility (powers can_delete / delete_blocked_reason, UX §8.1) ───

# Precedence for the human reason when an account has multiple blockers.
_BLOCKER_TRANSACTIONS = "has transactions"
_BLOCKER_VALUE_HISTORY = "has value history"


async def delete_blockers(db: AsyncSession, household_id: str) -> dict[str, str]:
    """Map every household account that **cannot** be hard-deleted to its reason, via batched
    queries (never per-row counts). Precedence: transactions → value history."""
    blockers: dict[str, str] = {}

    async def _ids(model: type, column: str) -> set[str]:
        col = getattr(model, column)
        stmt = select(col).where(model.household_id == household_id, col.is_not(None)).distinct()
        return {row for row in (await db.execute(stmt)).scalars().all()}

    # Lowest precedence first; later writes win for the chosen reason.
    for aid in await _ids(AccountSnapshot, "account_id"):
        blockers[aid] = _BLOCKER_VALUE_HISTORY
    for aid in (await _ids(FinancialEvent, "source_account_id")) | (
        await _ids(FinancialEvent, "destination_account_id")
    ):
        blockers[aid] = _BLOCKER_TRANSACTIONS
    return blockers


async def single_delete_blocker(
    db: AsyncSession, household_id: str, account_id: str
) -> str | None:
    """The hard-delete blocker reason for one account, or None if it is deletable. Same checks +
    precedence as `delete_blockers`, for single-row responses."""

    async def _referenced(model: type, column: str) -> bool:
        stmt = select(exists().where(getattr(model, column) == account_id))
        return bool((await db.execute(stmt)).scalar_one())

    if await _referenced(FinancialEvent, "source_account_id") or await _referenced(
        FinancialEvent, "destination_account_id"
    ):
        return _BLOCKER_TRANSACTIONS
    if await _referenced(AccountSnapshot, "account_id"):
        return _BLOCKER_VALUE_HISTORY
    return None
