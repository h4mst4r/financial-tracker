"""Account service (ARCH §3.5/§4.10, Story 4.1).

Create / read / update for the STI `accounts` table. Follows the generic-entity template (ARCH
§4.10) + the `category.py` audit pattern (validate → flush → `audit.log`). Archive/restore/delete/
duplicate are **Story 4.2** and intentionally absent here.

Accounts have **no name-uniqueness** constraint (unlike categories/currencies) — multiple "DBS"
accounts are valid. On create, the actor becomes the **sole owner** unless `owner_ids` is given;
multi-owner add/remove is `set_account_owners`/`replace_owners` (Story 4.3, `PUT /{id}/owners`).
"""

import logging
from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account, AccountOwner, AccountSnapshot
from backend.models.currency import Currency
from backend.models.event import FinancialEvent
from backend.models.identity import Person
from backend.schemas.account import (
    AccountCreate,
    AccountSnapshotCreate,
    AccountSnapshotUpdate,
    AccountUpdate,
)
from backend.services.audit import _scalar_snapshot, audit
from backend.services.base import assert_no_dependencies

logger = logging.getLogger(__name__)

# Which columns a PATCH may set per subtype. `AccountUpdate` is one flat schema (build-ahead, so
# Stories 4.7/4.8 need no schema change), so the service enforces discriminator integrity: a field
# foreign to the row's `account_type` (e.g. `cost_basis` on a bank) is rejected, not silently kept.
_SHARED_UPDATE_FIELDS = frozenset({"name", "currency", "institution", "notes", "colour", "vivid"})
# Money quantization (ARCH §3.2) — `value_base` is Numeric(15,4), `ROUND_HALF_UP` (mirrors
# currency.py:recompute_amount_base).
_MONEY_QUANT = Decimal("0.0001")
# Max points the card MiniSparkline plots (mirrors the frontend atom's MAX_POINTS in sparkline.ts).
_SPARK_MAX_POINTS = 12
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
        "reward_rate",
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


async def _resolve_rate(db: AsyncSession, household_id: str, code: str) -> Decimal:
    """The `rate_to_base` of a configured household currency, or 400 if the code isn't configured.
    Doubles as the "is this a real household currency" guard for create + snapshot."""
    rate = (
        await db.execute(
            select(Currency.rate_to_base).where(
                Currency.household_id == household_id, Currency.code == code
            )
        )
    ).scalar_one_or_none()
    if rate is None:
        errors.bad_request("Unknown currency", f"'{code}' is not a configured household currency")
    return rate


def _add_primary_owner(db: AsyncSession, account_id: str, person_id: str) -> None:
    """Attach one primary `account_owners` row (the sole owner on create/duplicate, or when create's
    `owner_ids` is omitted). Caller flushes."""
    db.add(
        AccountOwner(
            account_id=account_id,
            person_id=person_id,
            is_primary=True,
            added_at=datetime.now(UTC),
        )
    )


async def set_account_owners(
    db: AsyncSession,
    household_id: str,
    account_id: str,
    person_ids: Sequence[str],
    *,
    primary_preference: str | None,
) -> None:
    """Reconcile `account_owners` for `account_id` to exactly `person_ids` (set-semantics, Story
    4.3, AC1). The client sends the full desired set; this diffs against the existing rows.
    Validates BEFORE writing so a bad request leaves the junction untouched: the set must be
    non-empty (400) and every id must be a member of `household_id` — any status (400). Exactly one
    row stays `is_primary` (a server invariant, never client-trusted): the previous primary if it
    survives, else `primary_preference` if present, else the first id. No audit — the junction is
    the account's own composition, not an audited business column. Caller's `get_db` commits."""
    desired = list(dict.fromkeys(person_ids))  # de-dup, preserve order
    if not desired:
        errors.bad_request("Invalid owners", "An account must have at least one owner")
    members = set(
        (
            await db.execute(
                select(Person.id).where(
                    Person.household_id == household_id, Person.id.in_(desired)
                )
            )
        )
        .scalars()
        .all()
    )
    invalid = [pid for pid in desired if pid not in members]
    if invalid:
        errors.bad_request(
            "Invalid owners", f"{sorted(invalid)} are not members of this household"
        )

    existing = (
        (await db.execute(select(AccountOwner).where(AccountOwner.account_id == account_id)))
        .scalars()
        .all()
    )
    desired_set = set(desired)
    existing_ids = {o.person_id for o in existing}

    removed = existing_ids - desired_set
    if removed:
        await db.execute(
            delete(AccountOwner).where(
                AccountOwner.account_id == account_id,
                AccountOwner.person_id.in_(removed),
            )
        )
    for pid in desired:
        if pid not in existing_ids:
            db.add(
                AccountOwner(
                    account_id=account_id,
                    person_id=pid,
                    is_primary=False,
                    added_at=datetime.now(UTC),
                )
            )
    await db.flush()

    rows = (
        (await db.execute(select(AccountOwner).where(AccountOwner.account_id == account_id)))
        .scalars()
        .all()
    )
    surviving_primary = next((o.person_id for o in rows if o.is_primary), None)
    chosen = surviving_primary or (
        primary_preference if primary_preference in desired_set else desired[0]
    )
    for o in rows:
        o.is_primary = o.person_id == chosen
    await db.flush()


async def replace_owners(
    db: AsyncSession, household_id: str, actor_id: str, account_id: str, person_ids: Sequence[str]
) -> Account:
    """Replace an existing account's owner set (Story 4.3, AC3) — the `PUT /{id}/owners` entry
    point. 404 scope guard, then reconcile (previous primary kept if it survives, else first of the
    new set). `actor_id` is accepted for signature symmetry (owners aren't audited)."""
    obj = await get_or_404(db, Account, account_id, household_id=household_id)
    await set_account_owners(db, household_id, account_id, person_ids, primary_preference=None)
    return obj


async def create_account(
    db: AsyncSession, household_id: str, actor_id: str, data: AccountCreate
) -> Account:
    """Create an account of any subtype (AC1). The discriminated-union `data` carries only its
    subtype's columns; the rest stay NULL. Owners come from `data.owner_ids` (Story 4.3) or default
    to the creator as sole owner; writes a `create` audit row. The native `currency` (Story 4.4) is
    a real column carried in `data` — validated against the household's currencies before insert."""
    await _resolve_rate(db, household_id, data.currency)
    obj = Account(
        household_id=household_id,
        created_by=actor_id,
        status="active",
        **data.model_dump(exclude={"owner_ids"}),
    )
    db.add(obj)
    await db.flush()

    # owner_ids omitted → creator is the sole owner (Story 4.1 default); given → exactly that set
    # (Story 4.3, AC2), primary = the creator when present.
    if data.owner_ids:
        await set_account_owners(
            db, household_id, obj.id, data.owner_ids, primary_preference=actor_id
        )
    else:
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
    # Native currency is editable only while the account has no history (AC1) — a no-op (same value)
    # is always allowed. A real change must be a configured currency AND the account must have no
    # transactions/snapshots (changing it would reinterpret stored values).
    if "currency" in fields and fields["currency"] != obj.currency:
        await _resolve_rate(db, household_id, fields["currency"])  # 400 if unknown
        # ponytail: reuse single_delete_blocker — "has history" == "not deletable".
        if await single_delete_blocker(db, household_id, str(account_id)) is not None:
            errors.bad_request(
                "Currency locked",
                "Cannot change the currency of an account with transactions or value history",
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


# ─── Value snapshots + current-value resolution (Story 4.4) ───


async def create_snapshot(
    db: AsyncSession,
    household_id: str,
    actor_id: str,
    account_id: str,
    data: AccountSnapshotCreate,
) -> AccountSnapshot:
    """Record a value snapshot (AC2). 404-scope-guards the account, resolves the snapshot currency's
    `rate_to_base` (400 unknown → no row), caches `value_base = value × rate` (4dp, ROUND_HALF_UP —
    a convenience, not canonical, AC4b), and appends an `account_snapshots` row. Snapshots are
    **mutable corrections** (ARCH §3.5, Story 4.10) — create/update/delete are all audited."""
    await get_or_404(db, Account, account_id, household_id=household_id)  # scope guard
    rate = await _resolve_rate(db, household_id, data.currency)  # 400 before any write (AC4b)
    value_base = (data.value * rate).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
    snap = AccountSnapshot(
        household_id=household_id,
        created_by=actor_id,
        account_id=account_id,
        snapshot_date=data.snapshot_date,
        value=data.value,
        currency=data.currency,
        value_base=value_base,
        source=data.source,
        note=data.note,
    )
    db.add(snap)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="account_snapshot",
        entity_id=str(snap.id),
        before=None,
        after=_scalar_snapshot(snap),
    )
    return snap


async def update_snapshot(
    db: AsyncSession,
    household_id: str,
    actor_id: str,
    account_id: str,
    snapshot_id: str,
    data: AccountSnapshotUpdate,
) -> AccountSnapshot:
    """Edit a value snapshot (AC2). Scope-guards by household **and** account (a snap on another
    account → 404 here), applies the set fields, re-derives `value_base` when `value`/`currency`
    changed (400 unknown currency **before** any mutation), and audits the change."""
    snap = await _scoped_snapshot(db, household_id, account_id, snapshot_id)
    before = _scalar_snapshot(snap)
    fields = data.model_dump(exclude_unset=True)
    if "value" in fields or "currency" in fields:
        currency = fields.get("currency", snap.currency)
        value = fields.get("value", snap.value)
        rate = await _resolve_rate(db, household_id, currency)  # 400 before any write
        for key, val in fields.items():
            setattr(snap, key, val)
        snap.value_base = (value * rate).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
    else:
        for key, val in fields.items():
            setattr(snap, key, val)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="account_snapshot",
        entity_id=str(snap.id),
        before=before,
        after=_scalar_snapshot(snap),
    )
    return snap


async def delete_snapshot(
    db: AsyncSession,
    household_id: str,
    actor_id: str,
    account_id: str,
    snapshot_id: str,
) -> None:
    """Delete a value snapshot (AC3). Same scope guard as `update_snapshot`; nothing references a
    snapshot, so no dependency scan. Audited; current value recomputes from the remaining rows."""
    snap = await _scoped_snapshot(db, household_id, account_id, snapshot_id)
    before = _scalar_snapshot(snap)
    await db.delete(snap)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="account_snapshot",
        entity_id=str(snapshot_id),
        before=before,
        after=None,
    )


async def _scoped_snapshot(
    db: AsyncSession, household_id: str, account_id: str, snapshot_id: str
) -> AccountSnapshot:
    """A household-scoped snapshot that also belongs to `account_id` (else 404). `get_or_404` only
    scopes by household, so the account match is asserted explicitly (Story 4.10)."""
    snap = await get_or_404(db, AccountSnapshot, snapshot_id, household_id=household_id)
    if snap.account_id != account_id:
        errors.not_found("account_snapshot", snapshot_id)
    return snap


async def list_snapshots(
    db: AsyncSession, household_id: str, account_id: str
) -> Sequence[AccountSnapshot]:
    """An account's snapshots, newest-first (AC4a tiebreak + §8.2a header + the Story 4.5 chart).
    404-guards the account for scope."""
    await get_or_404(db, Account, account_id, household_id=household_id)  # scope guard
    stmt = (
        select(AccountSnapshot)
        .where(AccountSnapshot.account_id == account_id)
        .order_by(AccountSnapshot.snapshot_date.desc(), AccountSnapshot.created_at.desc())
    )
    return (await db.execute(stmt)).scalars().all()


async def list_account_events(
    db: AsyncSession,
    household_id: str,
    account_id: str,
    *,
    order: str,
    limit: int,
    offset: int,
) -> tuple[Sequence[FinancialEvent], int]:
    """An account's linked events for the transaction-history endpoint (FR-A-007, ARCH §3.6). Events
    where the account is the originating (`source_account_id`) **or** incoming-transfer
    (`destination_account_id`) leg — the exact filter §3.6 prescribes. `order` ('asc'|'desc') sorts
    by `event_date` with `created_at` as the stable tiebreak; `total` is the full match count
    (before `limit`/`offset`) so the caller can page. 404-guards the account for scope.
    # ponytail: empty until Epic 5 writes events — this is the read contract Epic 5's ledger
    # / Epic 9's Viewer consume; no event-write path exists yet."""
    await get_or_404(db, Account, account_id, household_id=household_id)  # scope guard
    where = (
        FinancialEvent.household_id == household_id,
        or_(
            FinancialEvent.source_account_id == account_id,
            FinancialEvent.destination_account_id == account_id,
        ),
    )
    count_stmt = select(func.count()).select_from(FinancialEvent).where(*where)
    total = (await db.execute(count_stmt)).scalar_one()
    keys = (FinancialEvent.event_date, FinancialEvent.created_at)
    ordering = [k.asc() for k in keys] if order == "asc" else [k.desc() for k in keys]
    stmt = select(FinancialEvent).where(*where).order_by(*ordering).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return rows, total


# Asset-like subtypes resolve current value from snapshots only; ledger-backed fall back to the
# opening anchor (the financial_events sum is an Epic 5 seam).
_LEDGER_BACKED = frozenset({"bank", "credit_card"})


async def current_values_for(
    db: AsyncSession, household_id: str, accounts: Sequence[Account]
) -> dict[str, tuple[Decimal, str] | None]:
    """Map each account id → its computed `(current_value, currency)` (or None), batched (no N+1).

    One ordered select of the household's snapshots; the first row per account is the latest
    (`snapshot_date DESC, created_at DESC` — same-date tiebreak via `created_at`, AC4a). Per
    account: asset-like → that latest `(value, currency)` or None; ledger-backed → the latest
    snapshot if any, else the opening anchor `(opening_balance, account.currency)`.
    """
    if not accounts:
        return {}
    ids = [a.id for a in accounts]
    rows = (
        await db.execute(
            select(
                AccountSnapshot.account_id,
                AccountSnapshot.value,
                AccountSnapshot.currency,
            )
            .where(AccountSnapshot.account_id.in_(ids))
            .order_by(
                AccountSnapshot.account_id,
                AccountSnapshot.snapshot_date.desc(),
                AccountSnapshot.created_at.desc(),
            )
        )
    ).all()
    latest: dict[str, tuple[Decimal, str]] = {}
    for account_id, value, currency in rows:
        latest.setdefault(account_id, (value, currency))  # first row per id = the latest

    out: dict[str, tuple[Decimal, str] | None] = {}
    for a in accounts:
        snap = latest.get(a.id)
        if snap is not None:
            out[a.id] = snap  # Epic 5 seam: + sum(ledger after anchor)
        elif a.account_type in _LEDGER_BACKED and a.opening_balance is not None:
            out[a.id] = (a.opening_balance, a.currency)
        else:
            out[a.id] = None
    return out


async def single_current_value(
    db: AsyncSession, household_id: str, account: Account
) -> tuple[Decimal, str] | None:
    """The computed `(current_value, currency)` for one account (via `current_values_for`)."""
    return (await current_values_for(db, household_id, [account]))[account.id]


async def value_series_for(
    db: AsyncSession, household_id: str, accounts: Sequence[Account]
) -> dict[str, list[Decimal]]:
    """Map each account id → its value-history series for the card MiniSparkline (Story 4.5).

    One ordered select of the household's snapshots; per account the last ≤12 `value_base` values,
    oldest→newest (the atom plots index 0 at the left). `value_base` (not native `value`) so the
    trend is currency-consistent across mixed-currency snapshots — the hero stays native; the
    sparkline is shape-only (§9.2). Snapshots only: a no-snapshot account → `[]` (the atom's
    "< 2 points" placeholder), never the opening anchor (that would draw a fake flat line).
    Batched (no N+1), the same shape as `current_values_for`.
    """
    if not accounts:
        return {}
    ids = [a.id for a in accounts]
    rows = (
        await db.execute(
            select(AccountSnapshot.account_id, AccountSnapshot.value_base)
            .where(AccountSnapshot.account_id.in_(ids))
            .order_by(
                AccountSnapshot.account_id,
                AccountSnapshot.snapshot_date.asc(),
                AccountSnapshot.created_at.asc(),
            )
        )
    ).all()
    series: dict[str, list[Decimal]] = {a.id: [] for a in accounts}
    for account_id, value_base in rows:
        series[account_id].append(value_base)
    # ponytail: window after grouping — keep the most recent 12, still oldest→newest.
    return {aid: vals[-_SPARK_MAX_POINTS:] for aid, vals in series.items()}


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
