// FX provider config types (ARCH §3.8/§5.7, Story 3.6). Snake_case wire (generic-entity surface).
// FxProvider is a flat config row — NOT a BaseEntity (no status/archive), like Currency. Secrets
// stay secret: `api_key_secret_ref` is a secret NAME (never a value); `key_configured` reports only
// whether the referenced env secret is set.

export interface FxProvider {
  id: string
  provider_type: string
  name: string
  base_url: string
  api_key_secret_ref: string | null
  priority: number
  is_enabled: boolean
  last_status: 'ok' | 'stale' | 'down' | null
  last_checked_at: string | null
  requires_key: boolean
  key_configured: boolean
}

/** A known provider type from `GET /api/fx-providers/types` (for the Add modal's type Dropdown). */
export interface FxProviderType {
  provider_type: string
  display_name: string
  base_url: string
  requires_key: boolean
}
