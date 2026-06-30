import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Shared internals for the Part II value-guards (UX §"Part II — Enforcement", L0–L13). Extracted from
// enforcement-l0-l20.test.ts so THREE consumers can share one definition: the guard suite itself (the
// self-tests + the real source sweeps), the coverage suite (discovery canary + allowlist audit), and the
// rogue-component fixture battery (every detector run end-to-end over one deliberately-bad real file).
//
// THE GOVERNING LAW (UX Part II lines 320–324; frontend.md §4.1c): ban the VALUE, not the EXAMPLE shape.
// Each guard declares the allowlist of legal HOMES for a value, then flags every OTHER origin.

export const SRC_DIR = join(__dirname, '..', '..', 'src')

/** Recursively collect source files of the given extensions under `dir` (default src/). */
export function srcFiles(exts: string[], dir = SRC_DIR): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...srcFiles(exts, full))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

/** Strip JS/TS/JSX comments so a banned token named in a warning comment isn't read as code.
 *  Leaves `://` (URLs) intact. (Mirrors design-tokens.test.ts.) */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Absolute src path → `src/…` POSIX relative path. */
export const rel = (file: string) => file.replace(SRC_DIR, 'src').replace(/\\/g, '/')

/** True if `relPath` (src/…) is under any allowlisted home (substring match, as the guards use it). */
export function allowed(relPath: string, allowlist: string[]): boolean {
  return allowlist.some((a) => relPath.includes(a))
}

/**
 * The generic guard runner: scan every non-allowlisted source file for `detect(src)` hits and return the
 * map of violations (file → matched fragments). The guard suite asserts this is empty.
 */
export function sweep(opts: {
  exts: string[]
  allowlist: string[]
  detect: (src: string) => string[]
}): Record<string, string[]> {
  const violations: Record<string, string[]> = {}
  for (const file of srcFiles(opts.exts)) {
    const r = rel(file)
    if (allowed(r, opts.allowlist)) continue
    const hits = opts.detect(stripComments(readFileSync(file, 'utf8')))
    if (hits.length) violations[r] = hits
  }
  return violations
}

// ─── L6 — Semantic / status tones (§4) ──────────────────────────────────────────────────────────────
// Ban the status tones 'success' | 'warning' | 'error' as a `Badge` VARIANT (inline, ternary, or a
// `Record<…, BadgeVariant>` value) outside the registry homes. NOT a bare string grep — that over-matches
// the sign-colour path (`semanticTextClass('success')`), the toast API (`variant: 'error'` object prop),
// the `PublicPageTone`/`SemanticIntent` type unions, and a URL param `'error'`. Scoped to the Badge-variant
// CONTEXT, with the sign-colour path explicitly legal.
const L6_TONES = '(success|warning|error)'
const L6_VARIANT_RE = new RegExp(
  `variant\\s*=\\s*(?:["']${L6_TONES}["']|\\{[^}]*['"]${L6_TONES}['"][^}]*\\})`,
)
const L6_BADGE_RECORD_RE = /Record<[^>]*BadgeVariant\s*>\s*=\s*\{[^}]*\}/g
const L6_MAP_VALUE_RE = new RegExp(`:\\s*["']${L6_TONES}["']`)
export function detectL6(src: string): string[] {
  const hits: string[] = []
  const variantHit = src.match(new RegExp(L6_VARIANT_RE, 'g'))
  if (variantHit) hits.push(...variantHit)
  for (const block of src.match(L6_BADGE_RECORD_RE) ?? []) {
    const mapHits = block.match(new RegExp(L6_MAP_VALUE_RE, 'g'))
    if (mapHits) hits.push(...mapHits)
  }
  return hits
}
// Legal homes: the one §4 semantic registry + its tone→variant bridge, the Badge primitive, the demo
// gallery. There is intentionally NO separate "category badge" home — category type is a semantic domain.
export const L6_ALLOW = [
  'src/config/statusRegistry.ts',
  'src/components/primitives/Badge.tsx',
  'src/pages/DesignSystem.tsx',
]

// ─── L3 — Text emphasis (no opacity-as-emphasis) ────────────────────────────────────────────────────
// Emphasis is the §2 contrast-derived util, never opacity (which bleeds the bg + breaks the §0.11 floor).
// The archived treatment legitimately uses `opacity-60`; reveal/animation opacities (0/100, 50) are fine.
const L3_RE = /\bopacity-(55|70|80)\b/
export const detectL3 = (src: string) => src.match(new RegExp(L3_RE, 'g')) ?? []
export const L3_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L5 — Disabled is the one §3a utility, never a hand-mixed opacity ───────────────────────────────
const L5_RE = /disabled:opacity-/
export const detectL5 = (src: string) => src.match(new RegExp(L5_RE, 'g')) ?? []
export const L5_ALLOW: string[] = []

// ─── L11 — Value atoms own all money/date formatting ────────────────────────────────────────────────
// `.toLocaleString` / `.toFixed` / hand-built dates only inside lib/ + the three value atoms.
const L11_RE = /\.(toLocaleString|toFixed)\b/
export const detectL11 = (src: string) => src.match(new RegExp(L11_RE, 'g')) ?? []
export const L11_ALLOW = [
  'src/lib/',
  'src/components/primitives/MonetaryValue',
  'src/components/primitives/DateValue',
  'src/components/primitives/NumberValue',
  'src/pages/DesignSystem.tsx',
]

// ─── L7 — Magic values (P4): no raw hex / arbitrary-Tailwind in TSX ──────────────────────────────────
// Allowlisted: the entity-colour data homes (ColourPicker palette/default, Avatar contrast pole), the
// press-scale token home, and the demo gallery. Everything else uses a named token / @utility.
const L7_HEX_RE = /#[0-9a-fA-F]{3,6}\b/
const L7_ARBITRARY_TW_RE = /\b[a-z-]+-\[[^\]]+\]/
export function detectL7(src: string): string[] {
  return [
    ...(src.match(new RegExp(L7_HEX_RE, 'g')) ?? []),
    ...(src.match(new RegExp(L7_ARBITRARY_TW_RE, 'g')) ?? []),
  ]
}
export const L7_ALLOW = [
  'src/components/primitives/ColourPicker.tsx',
  'src/components/primitives/Avatar.tsx',
  'src/components/primitives/behaviors/usePressable.ts',
  'src/pages/DesignSystem.tsx',
]

// ─── L9 — Elevation: shadow is a §9 token step, not a raw box-shadow ────────────────────────────────
const L9_RE = /boxShadow\s*:|shadow-\[/
export const detectL9 = (src: string) => src.match(new RegExp(L9_RE, 'g')) ?? []
export const L9_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L10 — Borders: width ∈ {1px, 2px-ring}; no raw border-width ────────────────────────────────────
const L10_RE = /borderWidth\s*:|border-\[/
export const detectL10 = (src: string) => src.match(new RegExp(L10_RE, 'g')) ?? []
export const L10_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L12 — Motion: durations/easings are tokens, not raw ms/cubic-bezier ────────────────────────────
const L12_RE = /duration-\[|ease-\[|transitionDuration\s*:|animationDuration\s*:/
export const detectL12 = (src: string) => src.match(new RegExp(L12_RE, 'g')) ?? []
export const L12_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L13 — Density: no HARDCODED height/padding (dynamic prop-driven sizes are fine) ─────────────────
// Bans a numeric/px LITERAL in an inline height/padding, or an arbitrary `h-[..]`/`p-[..]` bracket. A
// prop-driven `style={{ height: size }}` (a sized Avatar/Spinner/Icon) is legitimate and NOT flagged.
const L13_RE = /(height|padding|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*['"]?\d/
const L13_ARBITRARY_RE = /\b[hp][xy]?-\[[^\]]+\]/
export function detectL13(src: string): string[] {
  return [
    ...(src.match(new RegExp(L13_RE, 'g')) ?? []),
    ...(src.match(new RegExp(L13_ARBITRARY_RE, 'g')) ?? []),
  ]
}
export const L13_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L4 — Colour resolution: no per-element entity/semantic color-mix in TSX; call the resolver ──────
// The `color-mix(…)` lives in the resolver seam (`theme/colour.ts`) or as a CSS `@utility` in index.css —
// never authored inline per-element in a component.
const L4_RE = /color-mix\s*\(/
export const detectL4 = (src: string) => src.match(new RegExp(L4_RE, 'g')) ?? []
export const L4_ALLOW = ['src/pages/DesignSystem.tsx']

// ─── L0 — Behaviors: no bare portal / keydown re-implementing focus·dismiss outside the behavior ────
// `createPortal` lives ONLY in `behaviors/Portal.tsx`; a document `keydown` listener (dismiss / roving)
// lives in `behaviors/**`. The documented exceptions are explicit, rationale'd homes (not drift):
// Tooltip (CSS-primary Esc, 5f-1), ContextMenu (the composed document-level menu keyboard), Sidebar (the
// shell mobile-drawer Esc).
const L0_PORTAL_RE = /\bcreatePortal\b/
const L0_KEYDOWN_RE = /addEventListener\(\s*['"]keydown['"]/
export const detectL0Portal = (src: string) => src.match(new RegExp(L0_PORTAL_RE, 'g')) ?? []
export const detectL0Keydown = (src: string) => src.match(new RegExp(L0_KEYDOWN_RE, 'g')) ?? []
export const L0_PORTAL_ALLOW = ['src/components/primitives/behaviors/Portal.tsx']
export const L0_KEYDOWN_ALLOW = [
  'src/components/primitives/behaviors/', // the home (usePopover et al.)
  'src/components/primitives/Tooltip.tsx', // CSS-primary Esc (5f-1 documented exception)
  'src/components/primitives/ContextMenu.tsx', // composed document-level menu keyboard
  'src/components/shell/Sidebar.tsx', // shell mobile-drawer Esc (bespoke bottom sheet)
]

/** Every source-scan value-guard as data, so the coverage suite + rogue battery can iterate them all. */
export interface Guard {
  id: string
  label: string
  exts: string[]
  allowlist: string[]
  detect: (src: string) => string[]
}

export const GUARDS: Guard[] = [
  { id: 'L6', label: 'status tones resolve through the registry', exts: ['.ts', '.tsx'], allowlist: L6_ALLOW, detect: detectL6 },
  { id: 'L3', label: 'emphasis is the §2 util, not opacity', exts: ['.tsx'], allowlist: L3_ALLOW, detect: detectL3 },
  { id: 'L5', label: 'disabled is the `.disabled` utility, not disabled:opacity', exts: ['.tsx'], allowlist: L5_ALLOW, detect: detectL5 },
  { id: 'L11', label: 'money/date formatting lives in the value atoms', exts: ['.ts', '.tsx'], allowlist: L11_ALLOW, detect: detectL11 },
  { id: 'L7', label: 'no raw hex / arbitrary-Tailwind in TSX', exts: ['.tsx'], allowlist: L7_ALLOW, detect: detectL7 },
  { id: 'L9', label: 'shadow is a token step, never a raw box-shadow', exts: ['.tsx'], allowlist: L9_ALLOW, detect: detectL9 },
  { id: 'L10', label: 'no raw border-width', exts: ['.tsx'], allowlist: L10_ALLOW, detect: detectL10 },
  { id: 'L12', label: 'motion uses --duration/--ease tokens', exts: ['.tsx'], allowlist: L12_ALLOW, detect: detectL12 },
  { id: 'L13', label: 'no hardcoded height/padding', exts: ['.tsx'], allowlist: L13_ALLOW, detect: detectL13 },
  { id: 'L4', label: 'entity/semantic color-mix lives in the resolver', exts: ['.tsx'], allowlist: L4_ALLOW, detect: detectL4 },
  { id: 'L0-portal', label: 'createPortal lives only in the Portal behavior', exts: ['.ts', '.tsx'], allowlist: L0_PORTAL_ALLOW, detect: detectL0Portal },
  { id: 'L0-keydown', label: 'document keydown listeners live in behaviors/', exts: ['.ts', '.tsx'], allowlist: L0_KEYDOWN_ALLOW, detect: detectL0Keydown },
]
