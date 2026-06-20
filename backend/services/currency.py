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
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.db_utils import get_or_404
from backend.models.currency import Currency
from backend.schemas.currency import CurrencyCreate, CurrencyUpdate

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

    for key, value in fields.items():
        setattr(obj, key, value)
    await db.flush()
    return obj


async def delete_currency(db: AsyncSession, household_id: str, currency_id: str) -> None:
    """Hard-delete a non-base currency (AC 2). The **base** currency is fixed and non-removable
    (400) — a load-bearing data-integrity guard (base anchors all `amount_base`). No dependency
    scan: `financial_events.currency` is an ISO **code string**, not an FK to `currencies.id`, and
    `fx_rate_history` (the only FK) has no rows until Story 3.7. No audit (config/technical)."""
    obj = await get_or_404(db, Currency, currency_id, household_id=household_id)
    if obj.is_base:
        errors.bad_request(
            "Cannot delete base currency", "The base currency is fixed and cannot be removed"
        )
    await db.delete(obj)
    await db.flush()
    logger.info(
        "hard_delete_currency",
        extra={"household_id": str(household_id), "entity_id": str(currency_id)},
    )
