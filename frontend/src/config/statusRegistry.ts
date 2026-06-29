import type { BadgeVariant } from '../components/primitives/Badge'

// The ONE status binding (UX §4 lines 131–139). Every status indicator (chip · freshness badge ·
// ledger dot · alert badge) is a `Badge` driven by a TONE resolved from this registry — a surface
// passes a {domain, status} key, NEVER a colour. There is intentionally NO `StatusBadge` component:
// the systematized spec folds it into `Badge` (UX Layer-2 line 381 "Badge absorbs StatusBadge";
// do-not-recreate ledger line 504; FRONTEND-AUDIT B6).
//
// Five tones, each IS a §0/§4 token so they reskin per theme:
//   positive = success (green) · warning = warning (amber) · critical = error (red)
//   neutral  = grey (surface-active/border) · info = info (blue, the §0 anchor — NOT accent-secondary)
// No domain uses a sixth tone. `StatusTone` is also the shared vocabulary the icon registry's
// semantic/status glyphs key off (see config/iconRegistry.ts STATUS_ICON).
export type StatusTone = 'positive' | 'warning' | 'critical' | 'neutral' | 'info'

// Identity helper: validates every value is a StatusTone at compile time while preserving the literal
// domain/status keys (so StatusKey<D> below is the exact per-domain key union, not widened to string).
const defineStatusRegistry = <T extends Record<string, Record<string, StatusTone>>>(registry: T): T =>
  registry

// The §4 domain→status→tone table, verbatim. Add a status = add a row here; never map at a call site.
// Currency freshness (Currencies.tsx) + FX provider (Settings → ManagementTab) + the Toast semantic
// glyphs consume it today; Backup / Recurring / Transaction are built ahead of their consumers (P6).
export const STATUS_REGISTRY = defineStatusRegistry({
  currencyFreshness: { fresh: 'positive', stale: 'warning', never: 'neutral' },
  fxProvider: { ok: 'positive', stale: 'warning', down: 'critical', unknown: 'neutral' },
  backup: { success: 'positive', inProgress: 'warning', failed: 'critical' },
  recurringOccurrence: {
    processed: 'positive',
    upcoming: 'neutral',
    skipped: 'neutral',
    missed: 'critical',
    failed: 'critical',
  },
  transaction: { paid: 'positive', pending: 'warning', cancelled: 'neutral' },
  invitation: { accepted: 'positive', pending: 'warning', declined: 'neutral', expired: 'neutral', revoked: 'neutral' },
  // Member lifecycle + FX-provider config booleans (Settings → ManagementTab). These resolve here
  // instead of being authored as inline `cond ? 'success' : …` tone literals at the call site (§4 law:
  // "consume a key, never restyle a status"; the L6 guard bans the literal outside this registry).
  member: { active: 'positive', archived: 'neutral' },
  fxProviderKey: { set: 'positive', missing: 'warning' },
  fxProviderEnabled: { enabled: 'positive', disabled: 'neutral' },
  // Category type is a SEMANTIC badge (the §4 inflow/outflow colour — income green / expense red /
  // both blue), so it resolves through this one semantic registry like every other badge, not a
  // separate "category badge" concept.
  categoryType: { income: 'positive', expense: 'critical', both: 'info' },
})

export type StatusDomain = keyof typeof STATUS_REGISTRY
export type StatusKey<D extends StatusDomain> = keyof (typeof STATUS_REGISTRY)[D]

/** Resolve a {domain, status} key to its §4 tone. An unknown domain/status is a compile error. */
export function statusTone<D extends StatusDomain>(domain: D, status: StatusKey<D>): StatusTone {
  // The helper's constraint guarantees every value is a StatusTone; TS can't prove it through the
  // generic indexed access, so assert (sound — validated at the registry definition).
  return STATUS_REGISTRY[domain][status] as StatusTone
}

// The tone → Badge variant bridge. Two names differ from BadgeVariant (positive↔success,
// critical↔error), so this is an explicit map, not a cast. Render:
//   <Badge variant={BADGE_VARIANT_FOR_TONE[statusTone(domain, key)]}>
export const BADGE_VARIANT_FOR_TONE: Record<StatusTone, BadgeVariant> = {
  positive: 'success',
  warning: 'warning',
  critical: 'error',
  neutral: 'neutral',
  info: 'info',
}

/** String-tolerant Badge variant for a {domain, status} where `status` is a wire string (not a literal
 *  union) — unknown status → `neutral`. The §4-correct call for a freestyle status field. */
export function badgeVariantForStatus(domain: StatusDomain, status: string): BadgeVariant {
  const tone = (STATUS_REGISTRY[domain] as Record<string, StatusTone | undefined>)[status]
  return tone ? BADGE_VARIANT_FOR_TONE[tone] : 'neutral'
}
