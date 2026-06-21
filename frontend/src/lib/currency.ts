// Currency helpers (Story 3.5). ISO-4217 metadata comes from the runtime `Intl` — no dependency,
// no maintained 180-row table (ponytail: Intl IS the ISO-4217 source).

// The ColourPicker's curated 16-swatch palette is the deterministic colour source so a currency's
// default colour is stable and consistent with the picker (UX §8.2 / ARCH §3.8 "default derived
// deterministically from code").
const PALETTE = [
  '#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e',
  '#ef4444', '#3b82f6', '#a855f7', '#64748b', '#0ea5e9', '#84cc16', '#eab308', '#fb7185',
] as const

const STALE_MS = 48 * 60 * 60 * 1000 // FR-CU-001: amber-stale at > 48 hours

/** The full ISO-4217 code list the runtime knows (the "any ISO 4217" source). Empty on older
 *  runtimes without `supportedValuesOf` — the modal then falls back to free type-entry. */
export function isoCurrencyCodes(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []
}

/** The English display name for a code (e.g. "USD" → "US Dollar"); falls back to the code. */
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The narrow symbol for a code (e.g. "USD" → "$"); falls back to the code for unknown codes. */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/** A deterministic default hex for a code (§3.8) — stable across the chip and (future) chart series.
 *  Hashes the code into the curated PALETTE so it never collides with the design tokens. */
export function colourForCode(code: string): string {
  let hash = 0
  for (const ch of code.toUpperCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

/** The human-readable rate (UX §10 / bible §10): the base row reads "base"; others show the
 *  **inverse** of the stored `rate_to_base` as "1 {base} = N {target}". Display only — storage and
 *  all money math stay on `rate_to_base` (`amount_base = amount × rate_to_base`, ARCH §3.8). */
export function displayRate(rateToBase: string, baseCode: string, code: string, isBase: boolean): string {
  if (isBase) return 'base'
  const rate = Number(rateToBase)
  if (!Number.isFinite(rate) || rate === 0) return '—'
  const inverse = 1 / rate
  // 2–4 sig figs is enough for an at-a-glance rate; full precision lives in the stored Decimal.
  const formatted = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 }).format(inverse)
  return `1 ${baseCode} = ${formatted} ${code}`
}

/** `last_rate_at` round-trips from SQLite as a **naive** UTC string (no tz designator — see the
 *  Story 3.7 "SQLite drops tzinfo" note). Parse it AS UTC so the freshness/age math isn't skewed by
 *  the viewer's timezone: append `Z` when the string carries no offset/`Z`. */
function rateTimeMs(iso: string): number {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTz ? iso : `${iso}Z`).getTime()
}

/** The absolute last-updated time for the Status hover tooltip (local-rendered, Story 3.8). */
export function absoluteRateTime(iso: string): string {
  return new Date(rateTimeMs(iso)).toLocaleString()
}

/** Rate freshness (FR-CU-001): stale when never fetched (null) or older than 48 hours. */
export function isStale(lastRateAt: string | null): boolean {
  if (lastRateAt === null) return true
  return Date.now() - rateTimeMs(lastRateAt) > STALE_MS
}

/** Compact relative age for the Status badge (Story 3.8, UX §10): "just now" / "5m ago" /
 *  "2h ago" / "3d ago". Hand-rolled for the compact form — `Intl.RelativeTimeFormat` yields the
 *  verbose "2 hours ago", and `date-fns` "about 2 hours ago". No dependency. */
export function relativeAge(iso: string): string {
  const mins = Math.floor((Date.now() - rateTimeMs(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Whole hours since `iso` — the `stale {N}h` label (Story 3.8). */
export function staleHours(iso: string): number {
  return Math.floor((Date.now() - rateTimeMs(iso)) / (60 * 60 * 1000))
}
