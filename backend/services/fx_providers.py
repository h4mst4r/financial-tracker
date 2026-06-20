"""FX provider service — config-row CRUD + reorder + default seeding (ARCH §3.8/§5.7, Story 3.6).

`FxProvider` inherits `Base` (no audit/status block) and is **not** audited (§3.10: config-row).
So this module has **no `audit.log`, no archive/restore** — create / update / delete / reorder, plus
the idempotent default-chain seed (this story owns seeding, NOT `_create_and_seed_household`).

**Config only — nothing fetches yet.** The `FxProvider` Protocol impls, `httpx` calls, the
per-currency fallback walk, the circuit breaker, `FxRateHistory` writes, and the FX_API_DOWN alert
are all Story 3.7. `PROVIDER_TYPES` below is static *type metadata* (display name / base URL /
whether a key is needed) used to populate the type Dropdown + seed defaults — no callable fetcher.

**Secrets stay secret (AC2).** A provider's API key is never stored here nor returned by any
endpoint — only `api_key_secret_ref` (a secret/env NAME) is persisted; the value is resolved from
the environment at fetch time (Story 3.7). `key_configured` reports only the presence of that env
value, never the value itself.
"""

import logging
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.config import get_settings
from backend.db_utils import get_or_404
from backend.models.currency import FxProvider
from backend.schemas.fx_provider import FxProviderCreate, FxProviderUpdate

logger = logging.getLogger(__name__)

# Known provider types — metadata only (the fetch impls are Story 3.7). `default_secret_ref` is the
# conventional env/secret NAME holding the key for key-requiring types (resolved at fetch time).
# `// ponytail: registry is type metadata; the fetch impls are 3.7`.
PROVIDER_TYPES: dict[str, dict] = {
    "frankfurter": {
        "display_name": "Frankfurter (ECB)",
        "base_url": "https://api.frankfurter.dev",
        "requires_key": False,
        "default_secret_ref": None,  # nosec B105 — a config key name, not a secret value
    },
    "openexchangerates": {
        "display_name": "Open Exchange Rates",
        "base_url": "https://openexchangerates.org/api",
        "requires_key": True,
        "default_secret_ref": "EXCHANGERATE_API_KEY",  # nosec B105 — an env/secret NAME, not a key value
    },
    "exchangerate_api": {
        "display_name": "ExchangeRate-API",
        "base_url": "https://v6.exchangerate-api.com/v6",
        "requires_key": True,
        "default_secret_ref": "EXCHANGERATE_API_KEY",  # nosec B105 — an env/secret NAME, not a key value
    },
}

# The seeded default chain (priority order). Open Exchange Rates is the primary (hourly, 170+
# currencies) but seeds DISABLED until its key is set; Frankfurter (keyless ECB) is the always-on
# fallback, so FX works out of the box with zero secrets and OXR auto-promotes once a key is added.
_DEFAULT_CHAIN: list[str] = ["openexchangerates", "frankfurter"]


def key_configured(secret_ref: str | None) -> bool:
    """Whether the env/secret named by `secret_ref` is set — presence only, never the value.

    Secret/env names are upper-snake (`EXCHANGERATE_API_KEY`); `Settings` fields are lower-snake
    (`settings.exchangerate_api_key`). This is the only place a secret is touched, and only its
    presence (a bool) ever leaves it.
    """
    if not secret_ref:
        return False
    return bool(getattr(get_settings(), secret_ref.lower(), ""))


async def seed_default_providers(db: AsyncSession, household_id: str) -> None:
    """Seed the default provider chain (AC3) only when the household has **no** providers — so a
    2.3-created household backfills on first need, but a deliberately-pruned chain is NOT
    resurrected (removing a default sticks). Idempotent: a non-empty household is a no-op."""
    existing = await db.execute(
        select(FxProvider.id).where(FxProvider.household_id == household_id).limit(1)
    )
    if existing.first() is not None:
        return
    for priority, provider_type in enumerate(_DEFAULT_CHAIN):
        meta = PROVIDER_TYPES[provider_type]
        secret_ref = meta["default_secret_ref"]
        db.add(
            FxProvider(
                household_id=household_id,
                provider_type=provider_type,
                name=meta["display_name"],
                base_url=meta["base_url"],
                api_key_secret_ref=secret_ref,
                priority=priority,
                # Keyless providers are always usable; key providers only when the secret is set.
                is_enabled=(not meta["requires_key"]) or key_configured(secret_ref),
            )
        )
    await db.flush()


async def list_providers(db: AsyncSession, household_id: str) -> Sequence[FxProvider]:
    """The household's FX providers ordered by priority (the fallback chain). Seeds the default
    chain first if the household has none (seed-on-first-need). Reads aren't audited."""
    await seed_default_providers(db, household_id)
    stmt = (
        select(FxProvider)
        .where(FxProvider.household_id == household_id)
        .order_by(FxProvider.priority, FxProvider.name)
    )
    return (await db.execute(stmt)).scalars().all()


async def get_provider(db: AsyncSession, household_id: str, provider_id: str) -> FxProvider:
    """A single household-scoped provider (404 incl. cross-household)."""
    return await get_or_404(db, FxProvider, provider_id, household_id=household_id)


async def create_provider(
    db: AsyncSession, household_id: str, data: FxProviderCreate
) -> FxProvider:
    """Add a provider (AC1; owner-gated at the router). 400 on an unknown type. `name`/`base_url`
    default from the registry; `priority` appends to the chain end; the secret ref is cleared for
    keyless types. No raw key is stored (AC2). No audit (§3.10)."""
    meta = PROVIDER_TYPES.get(data.provider_type)
    if meta is None:
        errors.bad_request(
            "Unknown provider type", f"'{data.provider_type}' is not a supported FX provider"
        )

    if data.priority is not None:
        priority = data.priority
    else:
        max_priority = await db.scalar(
            select(func.max(FxProvider.priority)).where(FxProvider.household_id == household_id)
        )
        priority = 0 if max_priority is None else max_priority + 1

    obj = FxProvider(
        household_id=household_id,
        provider_type=data.provider_type,
        name=(data.name or meta["display_name"]).strip(),
        base_url=(data.base_url or meta["base_url"]).strip(),
        api_key_secret_ref=data.api_key_secret_ref if meta["requires_key"] else None,
        priority=priority,
        is_enabled=data.is_enabled,
    )
    db.add(obj)
    await db.flush()
    return obj


async def update_provider(
    db: AsyncSession, household_id: str, provider_id: str, data: FxProviderUpdate
) -> FxProvider:
    """Partial update (AC1) — name / base_url / api_key_secret_ref / priority / is_enabled. The type
    is immutable (not on the schema). A keyless type never carries a secret ref. No audit."""
    obj = await get_or_404(db, FxProvider, provider_id, household_id=household_id)
    fields = data.model_dump(exclude_unset=True)

    if not PROVIDER_TYPES.get(obj.provider_type, {}).get("requires_key", False):
        fields.pop("api_key_secret_ref", None)

    if "base_url" in fields and not (fields["base_url"] or "").strip():
        errors.bad_request("Invalid base URL", "Base URL cannot be empty")
    if "base_url" in fields:
        fields["base_url"] = fields["base_url"].strip()
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip()

    for key, value in fields.items():
        setattr(obj, key, value)
    await db.flush()
    return obj


async def reorder_providers(
    db: AsyncSession, household_id: str, ordered_ids: list[str]
) -> Sequence[FxProvider]:
    """Rewrite `priority` to the position in `ordered_ids` (AC1). The id list must match the
    household's providers exactly (every id present, no strangers) → 400 otherwise."""
    rows = (
        await db.execute(
            select(FxProvider).where(FxProvider.household_id == household_id)
        )
    ).scalars().all()
    if set(ordered_ids) != {r.id for r in rows}:
        errors.bad_request(
            "Invalid reorder", "The id list must match the household's providers exactly"
        )
    index = {pid: i for i, pid in enumerate(ordered_ids)}
    for r in rows:
        r.priority = index[r.id]
    await db.flush()
    rows.sort(key=lambda r: r.priority)
    return rows


async def delete_provider(db: AsyncSession, household_id: str, provider_id: str) -> None:
    """Hard-delete a provider (AC1). No audit, no dependency scan — nothing FKs `fx_providers`
    (3.7's `rate_source` is a name string, not an FK). The chain self-heals: a subsequent list
    re-seeds the keyless default if the household is emptied. ponytail: nothing FKs fx_providers."""
    obj = await get_or_404(db, FxProvider, provider_id, household_id=household_id)
    await db.delete(obj)
    await db.flush()
    logger.info(
        "delete_fx_provider",
        extra={"household_id": str(household_id), "entity_id": str(provider_id)},
    )
