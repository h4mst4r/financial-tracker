"""Financial-event (transaction) service (ARCH §3.2/§3.6/§3.8, Story 5.1).

Create / read / list for the **transaction** subtype of the STI `financial_events` table. Owns the
FX resolution (spot fill + manual override + base-currency collapse) prescribed by ARCH §3.2. The
recurring (Epic 6) and transfer (Epic 6) subtypes get their own service fns.

Transactions are **any-member** writes (the router does not gate on role) — the contrast with
`accounts`/`categories` (admin/owner). Per-row edit permission (Member own-rows) is Story 5.3.
"""

import base64
import json
from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account
from backend.models.budget import Category
from backend.models.currency import Currency
from backend.models.event import FinancialEvent
from backend.models.identity import Person
from backend.schemas.event import TransactionCreate, TransactionUpdate
from backend.services.audit import _scalar_snapshot, audit
from backend.services.base import assert_can_modify

# Money quantization (ARCH §3.2) — Numeric(15,4), ROUND_HALF_UP (mirrors account.py / currency.py).
_MONEY_QUANT = Decimal("0.0001")


async def _resolve_currency(db: AsyncSession, household_id: str, code: str) -> tuple[Decimal, bool]:
    """Return `(rate_to_base, is_base)` of a configured household currency, or 400 if the code isn't
    configured. Doubles as the "is this a real household currency" guard for create."""
    row = (
        await db.execute(
            select(Currency.rate_to_base, Currency.is_base).where(
                Currency.household_id == household_id, Currency.code == code
            )
        )
    ).one_or_none()
    if row is None:
        errors.bad_request("Unknown currency", f"'{code}' is not a configured household currency")
    return row[0], row[1]


async def _resolve_fx(
    db: AsyncSession,
    household_id: str,
    currency: str,
    amount: Decimal,
    amount_base_override: Decimal | None,
    event_date: date,
) -> tuple[Decimal, Decimal, Decimal, Decimal, date | None]:
    """Resolve the FX block (ARCH §3.2), shared by create + update so the math never drifts.

    `amount` is already quantized. Returns `(fx_rate, amount_base_calculated, amount_base, fx_delta,
    fx_rate_date)`. A base-currency row collapses the block (rate 1, calc == amount, no delta/date).
    On a foreign row the spot fill is `amount × rate_to_base`; a supplied `amount_base_override` is
    the exact bank-statement figure (`amount_base_source` reads `manual`), else the fill wins.
    """
    rate_to_base, is_base = await _resolve_currency(db, household_id, currency)
    if is_base:
        return Decimal(1), amount, amount, Decimal(0), None
    # Spot path (ARCH §3.2 priority 2). The account-FX-formula path (priority 1) is an Epic-7 seam
    # (Story 7.5) — no account carries a usable `fx_formula_id` calc yet, so foreign rows use spot.
    amount_base_calculated = (amount * rate_to_base).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
    amount_base = (
        amount_base_override.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
        if amount_base_override is not None
        else amount_base_calculated
    )
    fx_delta = amount_base_calculated - amount_base
    return rate_to_base, amount_base_calculated, amount_base, fx_delta, event_date


async def create_transaction(
    db: AsyncSession, household_id: str, actor_id: str, data: TransactionCreate
) -> FinancialEvent:
    """Create a completed manual transaction (AC1). Resolves the base amount by the ARCH §3.2 fill
    priority (spot rate today; the formula path is an Epic-7 seam), then applies the optional
    `amount_base` override → `fx_delta`. `currency == base` collapses the FX block (`fx_rate=1`,
    `fx_delta=0`, `fx_rate_date=None`). Cash (`payment_method='cash'`) nulls `source_account_id`.
    Any FK the client sends is validated household-scoped before insert."""
    # Household-scope every inbound FK so a cross-household id can't persist (404 if foreign).
    if data.category_id is not None:
        await get_or_404(db, Category, data.category_id, household_id=household_id)
    if data.payee_person_id is not None:
        await get_or_404(db, Person, data.payee_person_id, household_id=household_id)
    if data.source_account_id is not None:
        await get_or_404(db, Account, data.source_account_id, household_id=household_id)

    amount = data.amount.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
    fx_rate, amount_base_calculated, amount_base, fx_delta, fx_rate_date = await _resolve_fx(
        db, household_id, data.currency, amount, data.amount_base, data.event_date
    )

    # Shared expense is outflow-only (DB CHECK ck_shared_expense_outflow_only) — force False for
    # inflow so an inflow with the schema default (True) doesn't trip an IntegrityError.
    is_shared = data.is_shared_expense and data.transaction_type == "outflow"
    # Cash carries no account leg (ARCH §3.6): `payment_method='cash'` → source_account_id NULL.
    source_account_id = None if data.payment_method == "cash" else data.source_account_id

    event = FinancialEvent(
        household_id=household_id,
        created_by=actor_id,
        status="active",
        event_type="transaction",
        transaction_status="completed",
        source="manual",
        name=data.name,
        event_date=data.event_date,
        transaction_type=data.transaction_type,
        category_id=data.category_id,
        payee_person_id=data.payee_person_id,
        payment_method=data.payment_method,
        source_account_id=source_account_id,
        notes=data.notes,
        is_shared_expense=is_shared,
        is_gst_claimable=data.is_gst_claimable,
        currency=data.currency,
        amount=amount,
        fx_rate=fx_rate,
        amount_base_calculated=amount_base_calculated,
        amount_base=amount_base,
        fx_delta=fx_delta,
        fee_amount=data.fee_amount,
        fx_rate_date=fx_rate_date,
    )
    db.add(event)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="transaction",
        entity_id=str(event.id),
        before=None,
        after=_scalar_snapshot(event),
    )
    return event


def amount_base_source(event: FinancialEvent) -> str:
    """The derived FX-source indicator (§4 FX-base-source registry): `formula`|`spot`|`manual`.

    **Not a stored column** (ARCH §3.2 "the UI shows how it was derived"): `manual` when the user
    overrode the base amount (`amount_base != amount_base_calculated`), else `spot`. The `formula`
    state is an Epic-7 seam (Story 7.5 extends this once the account-FX-formula calc is wired)."""
    if event.amount_base != event.amount_base_calculated:
        return "manual"
    return "spot"


async def get_transaction(db: AsyncSession, household_id: str, event_id: str) -> FinancialEvent:
    """A single household-scoped transaction (404 if cross-household or not a transaction row)."""
    event = await get_or_404(db, FinancialEvent, event_id, household_id=household_id)
    if event.event_type != "transaction":
        errors.not_found("transaction", event_id)
    return event


# Money fields that force an FX recompute when any of them is edited (Story 5.3, §12.7).
_MONEY_EDIT_KEYS = {"currency", "amount", "amount_base"}


async def update_transaction(
    db: AsyncSession,
    household_id: str,
    actor_id: str,
    actor_role: str,
    event_id: str,
    data: TransactionUpdate,
) -> FinancialEvent:
    """Apply a partial update to a transaction (AC1/AC2). Serves BOTH the inline single-field commit
    and the modal's changed-set (ARCH §4.10 — one PATCH, presentation-only split). Per-row
    permission (Member own-rows, Admin/Owner any) via the shared `assert_can_modify` (AC3).

    Editing any money field (`amount`/`currency`/`amount_base`) re-resolves the FX block through the
    shared `_resolve_fx`; a supplied `amount_base` is the inline Base-{base} **manual override**
    (`amount_base_source → manual`), while a money edit that omits it re-fills from spot.
    `transaction_status` (pending/completed/cancelled/reconciled) is a plain scalar; `reconciled`
    is foreign-only, so it is coerced back to `completed` on a base-currency row (SCP 2026-07-02).
    `tags`/`duplicate_of` are NOT editable here (Stories 5.10/5.6 — absent from the schema)."""
    event = await get_transaction(db, household_id, event_id)
    assert_can_modify(event, actor_id, actor_role)

    fields = data.model_dump(exclude_unset=True)
    # Household-scope any FK being set (skip explicit-null clears — those are valid).
    if fields.get("category_id") is not None and "category_id" in fields:
        await get_or_404(db, Category, fields["category_id"], household_id=household_id)
    if fields.get("payee_person_id") is not None and "payee_person_id" in fields:
        await get_or_404(db, Person, fields["payee_person_id"], household_id=household_id)
    if fields.get("source_account_id") is not None and "source_account_id" in fields:
        await get_or_404(db, Account, fields["source_account_id"], household_id=household_id)

    before = _scalar_snapshot(event)

    # Apply the plain scalar fields verbatim (incl. `transaction_status`); the money block needs
    # quantize + FX recompute, handled below.
    for key, value in fields.items():
        if key not in _MONEY_EDIT_KEYS:
            setattr(event, key, value)
    if "amount" in fields:
        event.amount = fields["amount"].quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
    if "currency" in fields:
        event.currency = fields["currency"]
    if _MONEY_EDIT_KEYS & fields.keys():
        # A supplied `amount_base` is the manual override; a money edit without it re-fills from
        # spot (an inline amount/currency change drops any prior override back to computed base).
        override = fields.get("amount_base")
        fx_rate, abc, amount_base, fx_delta, fx_rate_date = await _resolve_fx(
            db, household_id, event.currency, event.amount, override, event.event_date
        )
        event.fx_rate = fx_rate
        event.amount_base_calculated = abc
        event.amount_base = amount_base
        event.fx_delta = fx_delta
        event.fx_rate_date = fx_rate_date

    # Cash carries no account leg (ARCH §3.6); shared-expense is outflow-only (DB CHECK) — mirror
    # the create-path coercions so a type/method edit can't trip an IntegrityError.
    if event.payment_method == "cash":
        event.source_account_id = None
    if event.transaction_type == "inflow":
        event.is_shared_expense = False
    # `reconciled` is a foreign-only status — a base-currency row has no FX to verify, so it can
    # never be reconciled (SCP 2026-07-02 R1/R4). Coerce back to `completed` if the row is (or was
    # edited to be) base currency. Only when the status or currency actually changed this PATCH —
    # nothing else can affect the foreign/reconciled invariant, and re-resolving the currency on an
    # unrelated edit is wasteful (and would 400 a reconciled row whose currency was since deleted).
    if event.transaction_status == "reconciled" and (
        "transaction_status" in fields or "currency" in fields
    ):
        _, is_base = await _resolve_currency(db, household_id, event.currency)
        if is_base:
            event.transaction_status = "completed"

    event.updated_by = actor_id
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="transaction",
        entity_id=str(event.id),
        before=before,
        after=_scalar_snapshot(event),
    )
    return event


async def archive_transaction(
    db: AsyncSession, household_id: str, actor_id: str, actor_role: str, event_id: str
) -> FinancialEvent:
    """Archive a transaction (AC5, FR-E-004) — a flat single-row flip (a transaction has no child
    tree). Returns **200, never 409**; idempotent (an already-archived row is a no-op). Excluded
    from the default ledger + actuals (`list_transactions` hides archived rows); history untouched.
    Per-row permission via `assert_can_modify` (AC3)."""
    event = await get_transaction(db, household_id, event_id)
    assert_can_modify(event, actor_id, actor_role)
    if event.archived:
        return event  # idempotent no-op
    before = _scalar_snapshot(event)
    event.status = "archived"
    event.archived = True
    event.archived_at = datetime.now(UTC)
    event.archived_by = actor_id
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="archive",
        entity_type="transaction",
        entity_id=str(event.id),
        before=before,
        after=_scalar_snapshot(event),
    )
    return event


async def restore_transaction(
    db: AsyncSession, household_id: str, actor_id: str, actor_role: str, event_id: str
) -> FinancialEvent:
    """Restore an archived transaction (AC5) — the inverse of `archive_transaction`. Idempotent."""
    event = await get_transaction(db, household_id, event_id)
    assert_can_modify(event, actor_id, actor_role)
    if not event.archived:
        return event  # idempotent no-op
    before = _scalar_snapshot(event)
    event.status = "active"
    event.archived = False
    event.archived_at = None
    event.archived_by = None
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="restore",
        entity_type="transaction",
        entity_id=str(event.id),
        before=before,
        after=_scalar_snapshot(event),
    )
    return event


# Identity/audit/lifecycle columns NOT copied when cloning (mirrors account._SNAPSHOT_SKIP).
_DUPLICATE_SKIP = frozenset(
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
        "status",
    }
)


async def duplicate_transaction(
    db: AsyncSession, household_id: str, actor_id: str, actor_role: str, event_id: str
) -> FinancialEvent:
    """Duplicate a transaction as an *operation* (⋮ menu, AC4; ARCH §4.10 lines 1818-1820).

    Clones the business columns into a new-UUID row, then **clears the date to today and zeroes the
    monetary fields** (`amount`/`amount_base`/`amount_base_calculated`/`fx_delta` → 0, and
    `duplicate_of` → null) — a "start a new transaction like this one" template completed later. No
    confirmation. `status='active'`, `created_by` = the duplicator; writes a `create` audit row (it
    is a new entity). Per-row permission is checked on the **source** (only clone a row you can
    edit)."""
    src = await get_transaction(db, household_id, event_id)
    assert_can_modify(src, actor_id, actor_role)
    cols = {
        col.key: getattr(src, col.key)
        for col in src.__table__.columns
        if col.key not in _DUPLICATE_SKIP
    }
    clone = FinancialEvent(household_id=household_id, created_by=actor_id, status="active", **cols)
    clone.event_date = date.today()
    clone.amount = Decimal(0)
    clone.amount_base = Decimal(0)
    clone.amount_base_calculated = Decimal(0)
    clone.fx_delta = Decimal(0)
    clone.duplicate_of = None
    clone.archived = False
    # A fresh template starts at the default status — never inherit the source's reconciled/void
    # state (SCP 2026-07-02: reconciliation is a status, not a flag).
    clone.transaction_status = "completed"
    db.add(clone)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="transaction",
        entity_id=str(clone.id),
        before=None,
        after=_scalar_snapshot(clone),
    )
    return clone


# Keyset-sortable columns (ARCH §4.10 `sort=<col[:dir]>`). Only these three are exposed to the
# ledger (UX §12.2 sortable Date/Amount/Base); any other `sort` value falls back to the default.
_SORTABLE = {
    "event_date": FinancialEvent.event_date,
    "amount": FinancialEvent.amount,
    "amount_base": FinancialEvent.amount_base,
}
_DEFAULT_SORT_COL = "event_date"
_DEFAULT_SORT_DIR = "desc"
_MAX_LIMIT = 200
_DEFAULT_LIMIT = 100


def _parse_sort(sort: str | None) -> tuple[str, str]:
    """`col[:dir]` → `(col, dir)`, allow-listed to `_SORTABLE` + `asc|desc`; else → default."""
    if not sort:
        return _DEFAULT_SORT_COL, _DEFAULT_SORT_DIR
    col, _, direction = sort.partition(":")
    if col not in _SORTABLE:
        return _DEFAULT_SORT_COL, _DEFAULT_SORT_DIR
    direction = direction if direction in ("asc", "desc") else "asc"
    return col, direction


def _encode_cursor(value: object, row_id: str) -> str:
    """Opaque base64 of the last row's `(sort_value, id)` — a keyset cursor, not an offset."""
    return base64.urlsafe_b64encode(json.dumps({"v": str(value), "id": row_id}).encode()).decode()


def _decode_cursor(cursor: str, sort_col: str) -> tuple[object, str]:
    """`(typed_sort_value, id)` from the opaque cursor. Types the value per the sort column (date vs
    Decimal) so the row-value comparison uses the right operator."""
    data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
    raw, row_id = data["v"], data["id"]
    typed: object = date.fromisoformat(raw) if sort_col == "event_date" else Decimal(raw)
    return typed, row_id


async def list_transactions(
    db: AsyncSession,
    household_id: str,
    *,
    include_archived: bool = False,
    search: str | None = None,
    date_start: date | None = None,
    date_end: date | None = None,
    category_id: str | None = None,
    transaction_type: str | None = None,
    account_id: str | None = None,
    person_id: str | None = None,
    transaction_status: str | None = None,
    is_gst_claimable: bool | None = None,
    reconciled: bool | None = None,
    sort: str | None = None,
    cursor: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> tuple[Sequence[FinancialEvent], str | None, int, dict[str, Decimal]]:
    """The household's transactions with server-side filters + sort + **keyset** pagination
    (ARCH §4.10). Returns `(rows, next_cursor, total, summary)`, where `summary` = base out/in
    totals over the *filtered* set (never derivable from `total`; ARCH lines 1779-1783).

    Sort allow-list = event_date / amount / amount_base + a deterministic `id` tie-break so the
    keyset cursor is stable. `limit` is clamped to [1, 200]."""
    limit = max(1, min(limit, _MAX_LIMIT))
    sort_col, sort_dir = _parse_sort(sort)
    col = _SORTABLE[sort_col]

    # Filters only (drives total + summary + the page query's base). The keyset clause is
    # pagination, NOT a filter, so it is layered on separately below.
    where = [
        FinancialEvent.household_id == household_id,
        FinancialEvent.event_type == "transaction",
    ]
    if not include_archived:
        where.append(FinancialEvent.archived.is_(False))
    if search:
        where.append(FinancialEvent.name.ilike(f"%{search}%"))
    if date_start is not None:
        where.append(FinancialEvent.event_date >= date_start)
    if date_end is not None:
        where.append(FinancialEvent.event_date <= date_end)
    if category_id is not None:
        where.append(FinancialEvent.category_id == category_id)
    if transaction_type in ("inflow", "outflow"):
        where.append(FinancialEvent.transaction_type == transaction_type)
    if account_id is not None:
        where.append(FinancialEvent.source_account_id == account_id)
    if person_id is not None:
        where.append(FinancialEvent.payee_person_id == person_id)
    if transaction_status is not None:
        where.append(FinancialEvent.transaction_status == transaction_status)
    if is_gst_claimable is not None:
        where.append(FinancialEvent.is_gst_claimable.is_(is_gst_claimable))
    if reconciled is not None:
        if reconciled:
            where.append(FinancialEvent.transaction_status == "reconciled")
        else:
            # "Unreconciled" is the FOREIGN worklist — rows not yet reconciled, excluding base-
            # currency rows (which have no FX to verify, SCP 2026-07-02 R6). Resolve the base code
            # once; a household always has exactly one base currency.
            base_code = (
                await db.execute(
                    select(Currency.code).where(
                        Currency.household_id == household_id, Currency.is_base.is_(True)
                    )
                )
            ).scalar_one_or_none()
            where.append(FinancialEvent.transaction_status != "reconciled")
            if base_code is not None:
                where.append(FinancialEvent.currency != base_code)

    total = (
        await db.execute(select(func.count()).select_from(FinancialEvent).where(*where))
    ).scalar_one()

    # Toolbar summary — server aggregate over the filtered set (ARCH lines 1779-1783). coalesce
    # so an empty set yields 0, not None. Cancelled transactions are excluded from every live
    # aggregation (Story 5.4, FR-E-005) — so the out/in totals drop them, but the items/total/cursor
    # keep them (a cancelled row still shows in the list, just greyed and not summed).
    summary_where = [*where, FinancialEvent.transaction_status != "cancelled"]
    summary_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (
                                FinancialEvent.transaction_type == "outflow",
                                FinancialEvent.amount_base,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                FinancialEvent.transaction_type == "inflow",
                                FinancialEvent.amount_base,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).where(*summary_where)
        )
    ).one()
    summary = {"out": Decimal(summary_row[0]), "inflow": Decimal(summary_row[1])}

    # Keyset page clause: rows strictly "after" the cursor row in the sort order (row-value
    # compare, id tie-break same direction). Fetch limit+1 to detect a next page in one query.
    page_where = list(where)
    if cursor:
        cur_value, cur_id = _decode_cursor(cursor, sort_col)
        if sort_dir == "asc":
            page_where.append(
                or_(col > cur_value, and_(col == cur_value, FinancialEvent.id > cur_id))
            )
        else:
            page_where.append(
                or_(col < cur_value, and_(col == cur_value, FinancialEvent.id < cur_id))
            )

    order = asc if sort_dir == "asc" else desc
    stmt = (
        select(FinancialEvent)
        .where(*page_where)
        .order_by(order(col), order(FinancialEvent.id))
        .limit(limit + 1)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        _encode_cursor(getattr(rows[-1], sort_col), rows[-1].id) if has_more and rows else None
    )
    return rows, next_cursor, total, summary
