"""Daily FX fetch (ARCH §5.6/§5.7) — the `/jobs/fx-refresh` engine (Story 3.7).

This is everything Story 3.6 deferred: the provider HTTP fetchers, the per-currency fallback walk,
`rate_to_base` math, `FxRateHistory` writes, the keep-last-rate circuit breaker, and the
`FX_API_DOWN` alert side-effect. Reuses the 3.6 `PROVIDER_TYPES` registry (one fetcher impl per
type) and the reference-only key model — the API key value is resolved from the environment ONLY
here, at fetch time, and is never stored or echoed.

Rate convention (the single source of truth, §3.8/§5.7): `rate_to_base = rates[BASE] /
rates[TARGET]` over each provider's native-relative rate dict (USD-native for OXR/ExchangeRate-API,
EUR-native for Frankfurter), so `amount_base = amount × rate_to_base`. The base is never fetched
(`rate_to_base = 1.0`). On all-provider failure for a currency the last-known rate is kept (never
null). 3 consecutive daily all-provider failures for a household → one `FX_API_DOWN` alert.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.models.currency import Currency, FxRateHistory
from backend.models.currency import FxProvider as FxProviderModel
from backend.models.identity import Household
from backend.services.alerts import create_alert
from backend.services.fx_providers import seed_default_providers
from backend.time_utils import as_utc

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0  # seconds, per provider (ARCH §5.7)
_RATE_QUANT = Decimal("0.000001")  # Numeric(10, 6)
# 3 consecutive daily cycles without a rate ⇒ FX_API_DOWN. Derived from last_rate_at staleness
# rather than a counter column (no migration). ponytail: streak = staleness, not a counter.
_STALE_STREAK = timedelta(hours=72)


# ── Provider fetchers (§5.7) ──


class FxProvider(Protocol):
    name: str

    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]:
        """Provider-native rates keyed by currency code, INCLUDING `base` itself (so the caller
        computes `rates[BASE] / rates[TARGET]` uniformly). Raises on non-200 / timeout."""
        ...


def _to_decimal(value: object) -> Decimal:
    return Decimal(str(value))


class FrankfurterProvider:
    """Keyless ECB provider (EUR-native). https://api.frankfurter.dev"""

    name = "frankfurter"

    def __init__(self, base_url: str, api_key: str | None) -> None:
        self._base_url = base_url.rstrip("/")

    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]:
        symbols = ",".join({base, *targets})
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{self._base_url}/v1/latest", params={"symbols": symbols})
        resp.raise_for_status()
        rates = {code: _to_decimal(v) for code, v in resp.json()["rates"].items()}
        rates.setdefault("EUR", Decimal("1"))  # EUR is the native unit; the API omits it from rates
        return rates


class OpenExchangeRatesProvider:
    """USD-native, keyed. https://openexchangerates.org/api"""

    name = "openexchangerates"

    def __init__(self, base_url: str, api_key: str | None) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]:
        symbols = ",".join({base, *targets})
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{self._base_url}/latest.json",
                params={"app_id": self._api_key, "symbols": symbols},
            )
        resp.raise_for_status()
        rates = {code: _to_decimal(v) for code, v in resp.json()["rates"].items()}
        rates.setdefault("USD", Decimal("1"))  # USD is the native unit
        return rates


class ExchangeRateApiProvider:
    """USD-native, key-in-path (v6). https://v6.exchangerate-api.com/v6"""

    name = "exchangerate_api"

    def __init__(self, base_url: str, api_key: str | None) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def fetch_latest(self, base: str, targets: list[str]) -> dict[str, Decimal]:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{self._base_url}/{self._api_key}/latest/USD")
        resp.raise_for_status()
        conversion = resp.json()["conversion_rates"]
        wanted = {base, *targets}
        return {code: _to_decimal(v) for code, v in conversion.items() if code in wanted}


_PROVIDER_IMPLS: dict[str, type[FxProvider]] = {
    "frankfurter": FrankfurterProvider,
    "openexchangerates": OpenExchangeRatesProvider,
    "exchangerate_api": ExchangeRateApiProvider,
}


def _normalize_base_url(base_url: str) -> str:
    """Default a missing URL scheme to https. A `base_url` saved without one (e.g. an owner edits
    it to `api.frankfurter.dev`) would make `httpx` raise `UnsupportedProtocol` and silently
    disable that provider — so a keyless fallback could never be called. `ponytail: add the scheme,
    don't make the user remember it`."""
    return base_url if "://" in base_url else f"https://{base_url}"


def _build_provider(row: FxProviderModel) -> FxProvider | None:
    """Instantiate the fetcher for a provider row, resolving its key from the env at fetch time
    (the only place the key VALUE is read — never stored/echoed; [[fx-provider-secret-handling]]).
    Unknown provider_type → None (skipped)."""
    impl = _PROVIDER_IMPLS.get(row.provider_type)
    if impl is None:
        return None
    api_key = None
    if row.api_key_secret_ref:
        api_key = getattr(get_settings(), row.api_key_secret_ref.lower(), "") or None
    return impl(_normalize_base_url(row.base_url), api_key)


# ── Refresh ──


async def refresh_fx(db: AsyncSession) -> dict:
    """Job entrypoint — refresh FX for every household (system-scoped, no session). Returns a
    small summary for the response/logs. Idempotent + safe to re-run the same day."""
    household_ids = (await db.execute(select(Household.id))).scalars().all()
    summary = {
        "households": len(household_ids),
        "currencies_updated": 0,
        "currencies_failed": 0,
        "alerts_raised": 0,
    }
    for hid in household_ids:
        updated, failed, alerted = await _refresh_household(db, hid)
        summary["currencies_updated"] += updated
        summary["currencies_failed"] += failed
        summary["alerts_raised"] += alerted
    logger.info("fx_refresh_complete", extra=summary)
    return summary


async def _refresh_household(db: AsyncSession, household_id: str) -> tuple[int, int, int]:
    """Refresh every non-base currency for one household via its enabled provider chain."""
    currencies = (
        (await db.execute(select(Currency).where(Currency.household_id == household_id)))
        .scalars()
        .all()
    )
    base = next((c for c in currencies if c.is_base), None)
    targets = [c for c in currencies if not c.is_base]
    if base is None or not targets:
        return (0, 0, 0)  # base needs no fetch; nothing to refresh without targets

    # Freshest known rate BEFORE this run — the staleness basis for FX_API_DOWN (capture first so a
    # successful run this cycle doesn't mask a 3-day gap).
    prior_rate_ats = [c.last_rate_at for c in targets if c.last_rate_at is not None]
    freshest_prior = max(prior_rate_ats) if prior_rate_ats else None

    # Seed the default chain (idempotent — only when the household has none) so a household that
    # never opened the Integrations panel still has the keyless Frankfurter fallback and FX works
    # out of the box (ARCH §3.8). The 3.6 seed otherwise only fires on GET /api/fx-providers.
    await seed_default_providers(db, household_id)

    provider_rows = (
        (
            await db.execute(
                select(FxProviderModel)
                .where(
                    FxProviderModel.household_id == household_id,
                    FxProviderModel.is_enabled.is_(True),
                )
                .order_by(FxProviderModel.priority, FxProviderModel.name)
            )
        )
        .scalars()
        .all()
    )
    providers = [(row, _build_provider(row)) for row in provider_rows]
    providers = [(row, impl) for row, impl in providers if impl is not None]

    now = datetime.now(UTC)
    today = now.date()  # UTC-consistent with last_rate_at + the UNIQUE (currency_id, rate_date) key
    provider_status: dict[str, str] = {}  # provider_id -> 'ok'|'down' (ok wins if it ever succeeds)
    updated = 0
    failed = 0

    for currency in targets:
        result = await _fetch_currency_rate(base.code, currency.code, providers, provider_status)
        if result is None:
            failed += 1  # keep last-known rate_to_base (never null) — the breaker
            continue
        rate, source = result
        currency.rate_to_base = rate
        currency.last_rate_at = now
        currency.rate_source = source
        await _upsert_history(db, currency.id, today, rate, source)
        updated += 1

    for row, _impl in providers:
        if row.id in provider_status:
            row.last_status = provider_status[row.id]
            row.last_checked_at = now

    alerts_raised = 0
    if updated == 0 and (freshest_prior is None or as_utc(freshest_prior) < now - _STALE_STREAK):
        alert = await create_alert(
            db,
            household_id=household_id,
            alert_type="FX_API_DOWN",
            title="FX rates unavailable",
            body=(
                "Automatic exchange-rate updates have failed for several days. "
                "Converted figures may be stale until a provider recovers."
            ),
            dedupe=True,
        )
        if alert is not None:
            alerts_raised = 1

    await db.flush()
    return (updated, failed, alerts_raised)


async def _fetch_currency_rate(
    base_code: str,
    target_code: str,
    providers: list[tuple[FxProviderModel, FxProvider]],
    provider_status: dict[str, str],
) -> tuple[Decimal, str] | None:
    """Walk the provider chain for ONE currency; first usable rate wins (per-currency fallback,
    §5.7). Returns `(rate_to_base, winning_provider_name)` or None if every provider failed."""
    for row, impl in providers:
        try:
            rates = await impl.fetch_latest(base_code, [target_code])
            rate = rates[base_code] / rates[target_code]
        except Exception as exc:  # noqa: BLE001 — non-200/timeout/missing-symbol = provider failure
            provider_status.setdefault(row.id, "down")
            logger.info(
                "fx_provider_failed",
                extra={"provider": impl.name, "currency": target_code, "error": str(exc)},
            )
            continue
        provider_status[row.id] = "ok"
        return (rate.quantize(_RATE_QUANT, rounding=ROUND_HALF_UP), impl.name)
    return None


async def _upsert_history(
    db: AsyncSession, currency_id: str, rate_date: date, rate: Decimal, source: str
) -> None:
    """One FxRateHistory row per (currency, day) — UNIQUE, so a same-day re-run updates."""
    existing = await db.scalar(
        select(FxRateHistory).where(
            FxRateHistory.currency_id == currency_id, FxRateHistory.rate_date == rate_date
        )
    )
    if existing is not None:
        existing.rate_to_base = rate
        existing.source = source
        return
    db.add(
        FxRateHistory(
            currency_id=currency_id, rate_date=rate_date, rate_to_base=rate, source=source
        )
    )
