"""FX provider transport (ARCH §3.8/§5.7, Story 3.6).

`GET /api/fx-providers` (+ `/types`) — household-scoped reads, any member (FR-HH-002). `POST` /
`PATCH` / `DELETE` / `POST .../reorder` — **owner only** (`require_role("owner")`; UX §5.2
Integrations are "owner-editable, read-only for others" — note: owner, NOT admin). Scoping is
always `get_household_id` (the session's household, never the body). Providers are flat config rows:
no archive/restore, no audit (§3.10). Snake_case wire (generic-entity surface).

**Secrets stay secret (AC2).** No endpoint returns a raw key. Responses carry `api_key_secret_ref`
(a secret NAME) + computed `requires_key` / `key_configured` (env presence only).

NOT here: FX fetch / HTTP / circuit breaker / FxRateHistory / FX_API_DOWN alert (all Story 3.7).
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.currency import FxProvider
from backend.models.identity import Person
from backend.schemas.fx_provider import (
    FxProviderCreate,
    FxProviderListOut,
    FxProviderReorder,
    FxProviderResponse,
    FxProviderUpdate,
)
from backend.services import fx_providers as fx_service

router = APIRouter(prefix="/api", tags=["fx-providers"])

# Module-level singleton so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_owner = require_role("owner")


def _to_response(provider: FxProvider) -> FxProviderResponse:
    """Build a response with computed `requires_key`/`key_configured` (never a key value, AC2)."""
    meta = fx_service.PROVIDER_TYPES.get(provider.provider_type, {})
    return FxProviderResponse.model_validate(provider).model_copy(
        update={
            "requires_key": meta.get("requires_key", False),
            "key_configured": fx_service.key_configured(provider.api_key_secret_ref),
        }
    )


@router.get("/fx-providers")
async def list_fx_providers(
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> FxProviderListOut:
    """The household's FX providers ordered by priority (any member). Seeds the default chain on
    first need. `{items, total}` per the list rule."""
    providers = await fx_service.list_providers(db, household_id)
    items = [_to_response(p) for p in providers]
    return FxProviderListOut(items=items, total=len(items))


@router.get("/fx-providers/types")
async def list_fx_provider_types(
    _household_id: str = Depends(get_household_id),  # any member; just requires a session+household
) -> list[dict]:
    """The known provider types (for the Add modal's type Dropdown) — metadata only, no secrets.
    Static route, registered before `/{provider_id}` to avoid the dynamic-match trap."""
    return [
        {
            "provider_type": key,
            "display_name": meta["display_name"],
            "base_url": meta["base_url"],
            "requires_key": meta["requires_key"],
        }
        for key, meta in fx_service.PROVIDER_TYPES.items()
    ]


@router.get("/fx-providers/{provider_id}")
async def get_fx_provider(
    provider_id: str,
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> FxProviderResponse:
    """A single household-scoped provider (any member). 404 incl. cross-household. Declared after
    the static `/types` route so it isn't shadowed."""
    provider = await fx_service.get_provider(db, household_id, provider_id)
    return _to_response(provider)


@router.post("/fx-providers", status_code=201)
async def create_fx_provider(
    data: FxProviderCreate,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> FxProviderResponse:
    """Add a provider (owner only). 400 on an unknown type."""
    provider = await fx_service.create_provider(db, household_id, data)
    return _to_response(provider)


@router.post("/fx-providers/reorder")
async def reorder_fx_providers(
    data: FxProviderReorder,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> FxProviderListOut:
    """Rewrite the fallback-chain order (owner only). The id list must match the household."""
    providers = await fx_service.reorder_providers(db, household_id, data.ordered_ids)
    items = [_to_response(p) for p in providers]
    return FxProviderListOut(items=items, total=len(items))


@router.patch("/fx-providers/{provider_id}")
async def patch_fx_provider(
    provider_id: str,
    data: FxProviderUpdate,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> FxProviderResponse:
    """Edit a provider / toggle `is_enabled` (owner only). 404 cross-household."""
    provider = await fx_service.update_provider(db, household_id, provider_id, data)
    return _to_response(provider)


@router.delete("/fx-providers/{provider_id}", status_code=204)
async def delete_fx_provider(
    provider_id: str,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete a provider (owner only). 404 cross-household."""
    await fx_service.delete_provider(db, household_id, provider_id)
    return Response(status_code=204)
