"""Currency service — flat config-row CRUD (ARCH §3.8, FR-CU-001/002/003, Story 3.5).

`Currency` inherits `Base` (no audit/status block) and is **not** audited (§3.10: currency
add/remove is config/technical). So this module has **no `audit.log`, no archive/restore** — just
create / update / delete, household-scoped, admin-gated at the router.

No FX fetching here: a new currency persists a placeholder `rate_to_base=1.0` + `last_rate_at=NULL`
(renders stale). The real immediate fetch + daily refresh land in Story 3.7 once a provider exists
(Story 3.6). The `rate_to_base` multiplier convention (`amount_base = amount × rate_to_base`) is
ARCH §3.8 — the UI's "1 base = N target" is the display inverse only.
"""

import logging
import re
from collections.abc import Sequence
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.account import Account
from backend.models.currency import Currency, FxRateHistory
from backend.models.event import FinancialEvent
from backend.models.identity import Household
from backend.schemas.currency import CurrencyCreate, CurrencyUpdate
from backend.services.alerts import create_alert
from backend.services.audit import audit

# The MiniSparkline plots the last 12 points (UX §9.2) — cap the per-currency history series here.
_HISTORY_LIMIT = 12
# Column scales (ARCH §3.2/§3.8): rate = Numeric(10,6); money = Numeric(15,4).
_RATE_QUANT = Decimal("0.000001")
_MONEY_QUANT = Decimal("0.0001")

logger = logging.getLogger(__name__)

# ISO-4217 codes are three uppercase letters. The frontend supplies real codes from the runtime
# `Intl` list; the service only format-validates (the API is a trust boundary). No 180-row ISO
# table on the backend — the client's Intl list is the source of valid codes.
_CODE_RE = re.compile(r"^[A-Z]{3}$")


async def list_currencies(db: AsyncSession, household_id: str) -> Sequence[Currency]:
    """The household's currencies (base first, then alphabetical by code). Reads aren't audited.
    Currencies don't archive, so there is no `include_archived`."""
    stmt = (
        select(Currency)
        .where(Currency.household_id == household_id)
        .order_by(Currency.is_base.desc(), Currency.code)
    )
    return (await db.execute(stmt)).scalars().all()


async def get_currency(db: AsyncSession, household_id: str, currency_id: str) -> Currency:
    """A single household-scoped currency (404 incl. cross-household)."""
    return await get_or_404(db, Currency, currency_id, household_id=household_id)


async def list_rate_histories(
    db: AsyncSession, currency_ids: Sequence[str]
) -> dict[str, list[float]]:
    """The last <=12 daily `rate_to_base` points (oldest->newest) per currency, for the row
    MiniSparkline (Story 3.8, FR-CU-009). One batched query over `fx_rate_history` (scoped via
    `currency_id` — no `household_id` column, ARCH §3.4; the ids passed in are already
    household-scoped by `list_currencies`). Returns `{currency_id: [rate, ...]}`."""
    if not currency_ids:
        return {}
    stmt = (
        select(
            FxRateHistory.currency_id,
            FxRateHistory.rate_date,
            FxRateHistory.rate_to_base,
        )
        .where(FxRateHistory.currency_id.in_(currency_ids))
        .order_by(FxRateHistory.currency_id, FxRateHistory.rate_date)
    )
    grouped: dict[str, list[float]] = {}
    for currency_id, _rate_date, rate_to_base in (await db.execute(stmt)).all():
        grouped.setdefault(currency_id, []).append(float(rate_to_base))
    # Keep the most recent <=12 (rows arrive oldest->newest, so the tail is the latest window).
    return {cid: series[-_HISTORY_LIMIT:] for cid, series in grouped.items()}


async def create_currency(
    db: AsyncSession, household_id: str, data: CurrencyCreate
) -> Currency:
    """Add an ISO-4217 currency (AC 1). Created **non-base** with a placeholder rate (real fetch is
    Story 3.7). 400 on a bad code; 409 on a duplicate code in the household. No audit (§3.10)."""
    code = data.code.strip().upper()
    if not _CODE_RE.match(code):
        errors.bad_request("Invalid currency code", f"'{data.code}' is not a valid ISO 4217 code")

    existing = await db.execute(
        select(Currency.id).where(
            Currency.household_id == household_id, Currency.code == code
        )
    )
    if existing.first() is not None:
        errors.duplicate_name("Currency", code)

    obj = Currency(
        household_id=household_id,
        code=code,
        name=data.name.strip(),
        symbol=data.symbol.strip(),
        colour=data.colour,
        vivid=data.vivid,
        is_base=False,
        is_display_active=data.is_display_active,
        # ponytail: placeholder rate; real fetch is Story 3.7 (no FX provider exists yet).
        rate_to_base=Decimal("1.0"),
        fee_pct=Decimal("0"),
    )
    db.add(obj)
    await db.flush()
    return obj


async def update_currency(
    db: AsyncSession, household_id: str, currency_id: str, data: CurrencyUpdate
) -> Currency:
    """Partial update (AC 1/2) — name / symbol / colour / vivid / is_display_active. The toggle in
    AC2 is just this with `{is_display_active}`. `code`/`is_base` aren't on `CurrencyUpdate`, so the
    identity + base flag can't be changed here. No audit (§3.10)."""
    obj = await get_or_404(db, Currency, currency_id, household_id=household_id)
    fields = data.model_dump(exclude_unset=True)

    # The base currency is "always shown" (AC2) — never let it be made non-display-active, even via
    # a hand-crafted PATCH (the UI exposes no toggle for it). Defense-in-depth for the future
    # switcher (Story 9.7), which will read this flag.
    if obj.is_base:
        fields.pop("is_display_active", None)

    if "name" in fields and not fields["name"].strip():
        errors.bad_request("Invalid name", "Currency name cannot be empty")
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    if "symbol" in fields:
        fields["symbol"] = fields["symbol"].strip()
    # A conversion fee can't be negative (the API is the trust boundary; the modal's min=0 is
    # client-only). Guard at the service layer like the blank-name check above.
    if fields.get("fee_pct") is not None and fields["fee_pct"] < 0:
        errors.bad_request("Invalid fee", "Conversion fee cannot be negative")

    for key, value in fields.items():
        setattr(obj, key, value)
    await db.flush()
    return obj


async def delete_currency(db: AsyncSession, household_id: str, currency_id: str) -> None:
    """Hard-delete a non-base currency (AC 2). The **base** currency is fixed and non-removable
    (400). An in-use currency — one an account is denominated in (`accounts.currency`, a code, not
    an FK) — is blocked (409 `has_dependencies`, Story 4.4) so deleting it can't orphan a name.
    No audit (config/technical)."""
    obj = await get_or_404(db, Currency, currency_id, household_id=household_id)
    if obj.is_base:
        errors.bad_request(
            "Cannot delete base currency", "The base currency is fixed and cannot be removed"
        )
    # ponytail: add accounts.currency to the in-use scan; don't build a new mechanism.
    in_use = (
        await db.execute(
            select(Account.id)
            .where(Account.household_id == household_id, Account.currency == obj.code)
            .limit(1)
        )
    ).first()
    if in_use is not None:
        errors.has_dependencies("Currency", obj.code, referrers=["accounts"])
    await db.delete(obj)
    await db.flush()
    logger.info(
        "hard_delete_currency",
        extra={"household_id": str(household_id), "entity_id": str(currency_id)},
    )


# ── Base-currency change + recompute (Story 3.9, FR-CU-005) ──


async def change_base_currency(
    db: AsyncSession, household_id: str, actor_id: str, new_code: str
) -> Household:
    """Change the household base currency (owner-only at the router) and recompute (ARCH §3.4 note).

    Re-bases every `Currency.rate_to_base` to the new base (new base → 1.0, others ÷ the new
    currency's old rate), flips `is_base`, sets `Household.base_currency`, recomputes every
    financial event's base amounts **synchronously** (resolved 2026-06-21 — not a `/jobs/*` run;
    sub-second at household scale, 0 events today), audits the change, and writes a completion
    `BASE_CURRENCY_CHANGED` alert. The request commits via `get_db`.
    """
    new_code = new_code.strip().upper()
    currencies = list(await list_currencies(db, household_id))
    new = next((c for c in currencies if c.code == new_code), None)
    if new is None:
        errors.not_found("Currency", new_code)
    if new.is_base:
        errors.bad_request(
            "Already the base currency", f"{new_code} is already the base currency"
        )
    # n2o = the new currency's CURRENT rate_to_base (new → old base). Re-basing divides by it.
    # A never-fetched currency carries the placeholder rate_to_base=1.0 (create_currency), so the
    # real "no rate yet" signal is `last_rate_at is None`, NOT a zero rate — block it (re-basing by
    # a placeholder would mislabel every other currency). `n2o == 0` stays as division safety.
    n2o = new.rate_to_base
    if new.last_rate_at is None or n2o is None or n2o == 0:
        errors.bad_request(
            "No exchange rate",
            f"{new_code} has no exchange rate yet — wait for the daily FX refresh",
        )

    old = next((c for c in currencies if c.is_base), None)
    for c in currencies:
        c.rate_to_base = (c.rate_to_base / n2o).quantize(_RATE_QUANT, rounding=ROUND_HALF_UP)
    new.rate_to_base = Decimal("1.000000")  # exact — kill any division drift on the new base
    if old is not None:
        old.is_base = False
    new.is_base = True

    household = (
        await db.execute(select(Household).where(Household.id == household_id))
    ).scalar_one()
    before = {"base_currency": household.base_currency}
    household.base_currency = new_code

    recomputed = await recompute_amount_base(db, household_id, new_code)
    await db.flush()

    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="household",
        entity_id=household_id,
        before=before,
        after={"base_currency": new_code},
    )
    await create_alert(
        db,
        household_id=household_id,
        alert_type="BASE_CURRENCY_CHANGED",
        title="Base currency changed",
        body=f"Base currency is now {new_code}. {recomputed} transactions were recomputed.",
    )
    return household


async def recompute_amount_base(db: AsyncSession, household_id: str, new_base_code: str) -> int:
    """Recompute every financial event's base amounts after a base change (FR-CU-005). Returns the
    count touched (0 for a zero-event household — ARCH §2.6).

    For each event: `amount_base_calculated = amount × rate(event.currency → new base on
    event_date)`, derived from `FxRateHistory` (`hist(c→old)/hist(new→old)` on that date — history
    rows are untouched and stay relative to the OLD base, so their ratio is target→new-base),
    falling back to the **re-based current** `rate_to_base` when a date has no history.
    `amount_base` resets to the recalculated value (a prior `manual` override was in old-base
    units — the override flow is Epic 5); `fx_delta = 0`; `fx_rate_date = event_date`. An event
    already in the new base gets `fx_rate=1`, no FX (`fx_rate_date=None`).
    """
    currencies = list(await list_currencies(db, household_id))
    by_code = {c.code: c for c in currencies}
    new_base = by_code.get(new_base_code)
    new_base_id = new_base.id if new_base is not None else None

    # One batched history read for all the household's currencies → {(cur_id, rate_date): rate}.
    ids = [c.id for c in currencies]
    history: dict[tuple[str, date], Decimal] = {}
    if ids:
        rows = (
            await db.execute(
                select(
                    FxRateHistory.currency_id,
                    FxRateHistory.rate_date,
                    FxRateHistory.rate_to_base,
                ).where(FxRateHistory.currency_id.in_(ids))
            )
        ).all()
        history = {(cid, rdate): rate for cid, rdate, rate in rows}

    events = (
        await db.execute(
            select(FinancialEvent).where(FinancialEvent.household_id == household_id)
        )
    ).scalars().all()

    for event in events:
        if event.currency == new_base_code:
            event.fx_rate = Decimal("1.000000")
            event.amount_base_calculated = event.amount
            event.amount_base = event.amount
            event.fx_delta = Decimal("0")
            event.fx_rate_date = None
            continue
        rate = _historical_rate(by_code, history, new_base_id, event.currency, event.event_date)
        calculated = (event.amount * rate).quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)
        event.fx_rate = rate.quantize(_RATE_QUANT, rounding=ROUND_HALF_UP)
        event.amount_base_calculated = calculated
        event.amount_base = calculated
        event.fx_delta = Decimal("0")
        event.fx_rate_date = event.event_date

    return len(events)


def _historical_rate(
    by_code: dict[str, Currency],
    history: dict[tuple[str, date], Decimal],
    new_base_id: str | None,
    code: str,
    event_date: date,
) -> Decimal:
    """The target→new-base rate for `code` on `event_date`: `hist(code→old)/hist(new→old)`, falling
    back to the re-based current `rate_to_base`. Returns 1 for an unmappable currency (no Currency
    row — events use household currencies, so this is a defensive floor, never the happy path)."""
    target = by_code.get(code)
    if target is None:
        return Decimal("1")
    fallback = target.rate_to_base  # already re-based to the new base before this runs
    if new_base_id is None:
        return fallback
    h_target = history.get((target.id, event_date))
    h_new = history.get((new_base_id, event_date))
    if h_target is not None and h_new is not None and h_new != 0:
        return h_target / h_new
    return fallback
