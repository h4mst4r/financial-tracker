"""FX provider request/response schemas (ARCH §3.8/§5.7, Story 3.6).

Generic-entity surface → **snake_case wire** (plain `BaseModel`, no `to_camel`), like
`schemas/currency.py` — NOT the §2.14.C household/profile camelCase exception. The list response
follows the `{items, total}` rule (backend.md §2).

**Secrets stay secret (AC2).** No schema carries a raw API key. `api_key_secret_ref` is a secret
*name* (e.g. `EXCHANGERATE_API_KEY`) resolved from the environment at fetch time (Story 3.7); the
response also exposes computed `requires_key` / `key_configured` (env presence) — never a value.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FxProviderCreate(BaseModel):
    # `provider_type` must be a registry key (validated in the service). `name`/`base_url` default
    # from the registry when omitted; `priority` appends to the chain end. No raw key field — only
    # the secret reference (a NAME), and it is ignored for keyless provider types.
    provider_type: str
    name: str | None = None
    base_url: str | None = None
    api_key_secret_ref: str | None = None
    priority: int | None = None
    is_enabled: bool = True


class FxProviderUpdate(BaseModel):
    # No `provider_type` — the type identity is immutable (it selects the future fetcher impl, 3.7).
    name: str | None = None
    base_url: str | None = None
    api_key_secret_ref: str | None = None
    priority: int | None = None
    is_enabled: bool | None = None


class FxProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider_type: str
    name: str
    base_url: str
    api_key_secret_ref: str | None
    priority: int
    is_enabled: bool
    last_status: str | None
    last_checked_at: datetime | None
    # Computed in the router from the registry + env (never a key value, AC2).
    requires_key: bool = False
    key_configured: bool = False


class FxProviderListOut(BaseModel):
    items: list[FxProviderResponse]
    total: int


class FxProviderReorder(BaseModel):
    # The full ordered list of provider ids; the service rewrites `priority` to the list index
    # (one explicit reorder, race-free vs. per-row up/down PATCHes).
    ordered_ids: list[str]
