// Currency — a flat household config row (ARCH §3.8, Story 3.5). Snake_case wire keys
// (generic-entity surface). Currencies do NOT archive, so `Currency` does NOT extend `BaseEntity`
// (no `status`); the page uses a plain `useQuery` + `api` mutations rather than `useEntityManager`.
// `rate_to_base` / `fee_pct` are Decimals → JSON strings; format them for display, never store as
// JS numbers. `rate_to_base` is the multiplier `amount_base = amount × rate_to_base`; the UI shows
// the inverse "1 base = N target" (display only). FX fetch fills `rate_to_base`/`last_rate_at`/
// `rate_source` in Story 3.7; fee editing + the FX-history chart are Story 3.8.
export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  colour: string | null
  vivid: boolean
  is_base: boolean
  is_display_active: boolean
  rate_to_base: string
  fee_pct: string
  last_rate_at: string | null
  rate_source: string | null
}
