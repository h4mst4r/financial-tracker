"""Financial-event (transaction) service (ARCH §3.2/§3.6/§3.8, Story 5.1).

Create / read / list for the **transaction** subtype of the STI `financial_events` table. Owns the
FX resolution (spot fill + manual override + base-currency collapse) prescribed by ARCH §3.2. The
recurring (Epic 6) and transfer (Epic 6) subtypes get their own service fns.

Transactions are **any-member** writes (the router does not gate on role) — the contrast with
`accounts`/`categories` (admin/owner). Per-row edit permission (Member own-rows) is Story 5.3.
"""

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account
from backend.models.budget import Category
from backend.models.currency import Currency
from backend.models.event import FinancialEvent
from backend.models.identity import Person
from backend.schemas.event import TransactionCreate
from backend.services.audit import _scalar_snapshot, audit

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


async def create_transaction(
    db: AsyncSession, household_id: str, actor_id: str, data: TransactionCreate
) -> FinancialEvent:
    """Create a completed manual transaction (AC1). Resolves the base amount by the ARCH §3.2 fill
    priority (spot rate today; the formula path is an Epic-7 seam), then applies the optional
    `amount_base` override → `fx_delta`. `currency == base` collapses the FX block (`fx_rate=1`,
    `fx_delta=0`, `fx_rate_date=None`). Cash (`payment_method='cash'`) nulls `source_account_id`.
    Any FK the client sends is validated household-scoped before insert."""
    rate_to_base, is_base = await _resolve_currency(db, household_id, data.currency)

    # Household-scope every inbound FK so a cross-household id can't persist (404 if foreign).
    if data.category_id is not None:
        await get_or_404(db, Category, data.category_id, household_id=household_id)
    if data.payee_person_id is not None:
        await get_or_404(db, Person, data.payee_person_id, household_id=household_id)
    if data.source_account_id is not None:
        await get_or_404(db, Account, data.source_account_id, household_id=household_id)

    amount = data.amount.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)

    if is_base:
        # No conversion for the base currency: rate 1, calc == amount, no date/delta/override.
        fx_rate = Decimal(1)
        amount_base_calculated = amount
        amount_base = amount
        fx_delta = Decimal(0)
        fx_rate_date = None
    else:
        # Spot path (ARCH §3.2 priority 2): amount_base_calculated = amount × rate_to_base.
        # ponytail: the account-FX-formula path (priority 1) is an Epic-7 seam (Story 7.5) — no
        # account carries a usable `fx_formula_id` calc yet, so every foreign row resolves via spot.
        fx_rate = rate_to_base
        amount_base_calculated = (amount * rate_to_base).quantize(
            _MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        # Override → the exact bank-statement figure (indicator flips to `manual`); else the fill.
        amount_base = (
            data.amount_base.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
            if data.amount_base is not None
            else amount_base_calculated
        )
        fx_delta = amount_base_calculated - amount_base
        fx_rate_date = data.event_date

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


async def list_transactions(
    db: AsyncSession, household_id: str, *, include_archived: bool = False
) -> tuple[Sequence[FinancialEvent], int]:
    """The household's transactions, newest-first (`event_date DESC, created_at DESC`). Active only
    unless `include_archived`. Returns `(rows, total)`.

    # ponytail: limit/offset/cursor pagination + the FilterBar filters are the Story 5.2 ledger
    # seam — kept out of this signature until the ledger consumes them."""
    where = [
        FinancialEvent.household_id == household_id,
        FinancialEvent.event_type == "transaction",
    ]
    if not include_archived:
        where.append(FinancialEvent.archived.is_(False))
    total = (
        await db.execute(select(func.count()).select_from(FinancialEvent).where(*where))
    ).scalar_one()
    stmt = (
        select(FinancialEvent)
        .where(*where)
        .order_by(FinancialEvent.event_date.desc(), FinancialEvent.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return rows, total
