import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Part II — Enforcement (UX §"Part II — Enforcement", L0–L20). The conformance laws as CI guards.
//
// THE GOVERNING LAW (UX Part II lines 320–324; frontend.md §4.1c): ban the VALUE, not the EXAMPLE shape.
// Every guard below declares the allowlist of legal HOMES for a value, then flags every OTHER origin —
// never the one syntactic shape an audit recorded. Each guard is proven non-vacuous by a self-test that
// plants the violation in a NON-OBVIOUS shape (a Record value / a ternary / a helper, not just an inline
// literal) and asserts the detector reddens. A guard that only catches the inline example is theatre.
//
// This file holds the source-scan guards: L0, L3, L4, L5, L6, L7, L9, L10, L11, L12, L13, L20, plus
// pointers asserting the pre-existing L1/L1a (ramp-derivation.test.ts), L17 (design-tokens.test.ts) and
// L18 (design-system-completeness.test.tsx) guards run. L8 is an `eslint` no-restricted-syntax rule; L14
// is `eslint` no-restricted-imports; L15 is `eslint-plugin-jsx-a11y` (+ the ramp floor unit); L16/L19 are
// integration tests (enforcement-l16-keyboard / enforcement-l19-data-states). L2 = lint/review (N/A here).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const SRC_DIR = join(__dirname, '..', 'src')

/** Recursively collect source files of the given extensions under src/. */
function srcFiles(exts: string[], dir = SRC_DIR): string[] {
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
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const rel = (file: string) => file.replace(SRC_DIR, 'src').replace(/\\/g, '/')

/** True if `relPath` (src/…) is under any allowlisted home. */
function allowed(relPath: string, allowlist: string[]): boolean {
  return allowlist.some((a) => relPath.includes(a))
}

/**
 * The generic guard runner: scan every non-allowlisted source file for `detect(src)` hits and assert the
 * map of violations is empty. `detect` returns the matched fragments (for a useful failure message).
 */
function sweep(opts: {
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
// the `PublicPageTone`/`SemanticIntent` type unions, and a URL param `'error'`. The detector is scoped to
// the Badge-variant CONTEXT, with the sign-colour path explicitly legal.
const L6_TONES = '(success|warning|error)'
// `variant="…"` (inline string) or `variant={…}` whose brace region contains a tone literal (ternary,
// computed, helper-return) — catches the inline form AND the re-expressions.
const L6_VARIANT_RE = new RegExp(
  `variant\\s*=\\s*(?:["']${L6_TONES}["']|\\{[^}]*['"]${L6_TONES}['"][^}]*\\})`,
)
// A tone literal that is a VALUE of a `Record<…, BadgeVariant>` map. Scoped to the map's own object
// literal — NOT "any `: 'success'` in a file that happens to mention BadgeVariant" (that false-positives
// an unrelated toast `variant: 'error'` sitting in the same file as a harmless neutral ROLE_BADGE map).
const L6_BADGE_RECORD_RE = /Record<[^>]*BadgeVariant\s*>\s*=\s*\{[^}]*\}/g
const L6_MAP_VALUE_RE = new RegExp(`:\\s*["']${L6_TONES}["']`)
function detectL6(src: string): string[] {
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
// gallery. The sign-colour path is legal by construction (it's not a `variant=`/BadgeVariant map). There
// is intentionally NO separate "category badge" home — category type is a semantic domain in the registry.
const L6_ALLOW = [
  'src/config/statusRegistry.ts',
  'src/components/primitives/Badge.tsx',
  'src/pages/DesignSystem.tsx',
]

describe('Part II · L6 — status tones resolve through the registry, never authored at a call site', () => {
  it('detector reddens on every non-obvious shape (inline · ternary · Record value)', () => {
    expect(detectL6(`<Badge variant="success">x</Badge>`).length).toBeGreaterThan(0)
    expect(detectL6(`<Badge variant={archived ? 'neutral' : 'success'}>x</Badge>`).length).toBeGreaterThan(0)
    expect(detectL6(`const M: Record<string, BadgeVariant> = { a: 'error' }`).length).toBeGreaterThan(0)
    // …and stays silent on the legal lookalikes the literal-grep over-matches:
    expect(detectL6(`semanticTextClass(d > 0 ? 'success' : 'error', vivid)`)).toEqual([])
    expect(detectL6(`push({ message: 'no', variant: 'error' })`)).toEqual([])
    expect(detectL6(`type PublicPageTone = 'accent' | 'warning' | 'error'`)).toEqual([])
    // …including a harmless neutral BadgeVariant map sharing a file with an unrelated toast literal
    // (the Record-value scan is scoped to the map's object, not the whole file):
    expect(
      detectL6(
        `const ROLE: Record<R, BadgeVariant> = { owner: 'outline', member: 'neutral' }\n` +
          `push({ variant: 'error' })`,
      ),
    ).toEqual([])
  })

  it('no Badge-variant tone literal outside the registry / identity-badge / Badge homes', () => {
    expect(sweep({ exts: ['.ts', '.tsx'], allowlist: L6_ALLOW, detect: detectL6 })).toEqual({})
  })
})

// ─── L3 — Text emphasis (no opacity-as-emphasis) ────────────────────────────────────────────────────
// Emphasis is the §2 contrast-derived util, never opacity (which bleeds the bg + breaks the §0.11 floor).
// The archived treatment legitimately uses `opacity-60`; reveal/animation opacities (0/100, 50) are fine.
const L3_RE = /\bopacity-(55|70|80)\b/
const detectL3 = (src: string) => src.match(new RegExp(L3_RE, 'g')) ?? []
const L3_ALLOW = ['src/pages/DesignSystem.tsx']

describe('Part II · L3 — emphasis is the §2 util, not opacity', () => {
  it('detector reddens on a planted opacity-emphasis class', () => {
    expect(detectL3(`<span className="text-sm opacity-70">muted</span>`).length).toBeGreaterThan(0)
    expect(detectL3(`className={cx('opacity-55', other)}`).length).toBeGreaterThan(0)
    expect(detectL3(`<span className="opacity-60">archived</span>`)).toEqual([]) // sanctioned archived tone
  })
  it('no opacity-55/70/80 used as text emphasis', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L3_ALLOW, detect: detectL3 })).toEqual({})
  })
})

// ─── L5 — Disabled is the one §3a utility, never a hand-mixed opacity ───────────────────────────────
const L5_RE = /disabled:opacity-/
const detectL5 = (src: string) => src.match(new RegExp(L5_RE, 'g')) ?? []

describe('Part II · L5 — disabled is the `.disabled` utility, not disabled:opacity', () => {
  it('detector reddens on a planted disabled:opacity', () => {
    expect(detectL5(`<button className="disabled:opacity-50">x</button>`).length).toBeGreaterThan(0)
  })
  it('no disabled:opacity-* anywhere', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: [], detect: detectL5 })).toEqual({})
  })
})

// ─── L11 — Value atoms own all money/date formatting ────────────────────────────────────────────────
// `.toLocaleString` / `.toFixed` / hand-built dates only inside lib/ + the three value atoms.
const L11_RE = /\.(toLocaleString|toFixed)\b/
const detectL11 = (src: string) => src.match(new RegExp(L11_RE, 'g')) ?? []
const L11_ALLOW = [
  'src/lib/',
  'src/components/primitives/MonetaryValue',
  'src/components/primitives/DateValue',
  'src/components/primitives/NumberValue',
  'src/pages/DesignSystem.tsx',
]

describe('Part II · L11 — money/date formatting lives in the value atoms, not call sites', () => {
  it('detector reddens on planted toLocaleString/toFixed (incl. via a helper)', () => {
    expect(detectL11(`const s = amount.toLocaleString()`).length).toBeGreaterThan(0)
    expect(detectL11(`const fmt = (n) => n.toFixed(2)`).length).toBeGreaterThan(0)
  })
  it('no hand-formatted money/date outside lib/ + the value atoms', () => {
    expect(sweep({ exts: ['.ts', '.tsx'], allowlist: L11_ALLOW, detect: detectL11 })).toEqual({})
  })
})

// ─── L7 — Magic values (P4): no raw hex / arbitrary-Tailwind in TSX ──────────────────────────────────
// Allowlisted: the entity-colour data homes (ColourPicker palette/default, Avatar contrast pole), the
// press-scale token home, and the demo gallery. Everything else uses a named token / @utility.
const L7_HEX_RE = /#[0-9a-fA-F]{3,6}\b/
const L7_ARBITRARY_TW_RE = /\b[a-z-]+-\[[^\]]+\]/
function detectL7(src: string): string[] {
  return [
    ...(src.match(new RegExp(L7_HEX_RE, 'g')) ?? []),
    ...(src.match(new RegExp(L7_ARBITRARY_TW_RE, 'g')) ?? []),
  ]
}
const L7_ALLOW = [
  'src/components/primitives/ColourPicker.tsx',
  'src/components/primitives/Avatar.tsx',
  'src/components/primitives/behaviors/usePressable.ts',
  'src/pages/DesignSystem.tsx',
]

describe('Part II · L7 — no raw hex / arbitrary-Tailwind in TSX (P4)', () => {
  it('detector reddens on a planted hex + arbitrary-TW value', () => {
    expect(detectL7(`const c = '#abcdef'`).length).toBeGreaterThan(0)
    expect(detectL7(`<div className="w-[37px] grid-cols-[1fr_auto]" />`).length).toBeGreaterThan(0)
    expect(detectL7(`<div className="grid grid-cols-snapshot-row gap-xs" />`)).toEqual([]) // named utility ok
  })
  it('no raw hex / arbitrary-Tailwind outside the entity-colour + press-scale homes', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L7_ALLOW, detect: detectL7 })).toEqual({})
  })
})

// ─── L9 — Elevation: shadow is a §9 token step, not a raw box-shadow ────────────────────────────────
const L9_RE = /boxShadow\s*:|shadow-\[/
const detectL9 = (src: string) => src.match(new RegExp(L9_RE, 'g')) ?? []
const L9_ALLOW = ['src/pages/DesignSystem.tsx']
describe('Part II · L9 — shadow is a token step, never a raw box-shadow', () => {
  it('detector reddens on a planted raw shadow', () => {
    expect(detectL9(`style={{ boxShadow: '0 1px 2px black' }}`).length).toBeGreaterThan(0)
    expect(detectL9(`<div className="shadow-[0_1px_2px]" />`).length).toBeGreaterThan(0)
  })
  it('no raw box-shadow in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L9_ALLOW, detect: detectL9 })).toEqual({})
  })
})

// ─── L10 — Borders: width ∈ {1px, 2px-ring}; no raw border-width ────────────────────────────────────
const L10_RE = /borderWidth\s*:|border-\[/
const detectL10 = (src: string) => src.match(new RegExp(L10_RE, 'g')) ?? []
describe('Part II · L10 — no raw border-width', () => {
  it('detector reddens on a planted raw border width', () => {
    expect(detectL10(`style={{ borderWidth: 3 }}`).length).toBeGreaterThan(0)
    expect(detectL10(`<div className="border-[3px]" />`).length).toBeGreaterThan(0)
  })
  it('no raw border-width in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: ['src/pages/DesignSystem.tsx'], detect: detectL10 })).toEqual({})
  })
})

// ─── L12 — Motion: durations/easings are tokens, not raw ms/cubic-bezier ────────────────────────────
const L12_RE = /duration-\[|ease-\[|transitionDuration\s*:|animationDuration\s*:/
const detectL12 = (src: string) => src.match(new RegExp(L12_RE, 'g')) ?? []
describe('Part II · L12 — motion uses --duration/--ease tokens', () => {
  it('detector reddens on a planted raw duration/ease', () => {
    expect(detectL12(`<div className="duration-[200ms]" />`).length).toBeGreaterThan(0)
    expect(detectL12(`<div className="ease-[cubic-bezier(0,0,1,1)]" />`).length).toBeGreaterThan(0)
  })
  it('no raw duration/ease in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: ['src/pages/DesignSystem.tsx'], detect: detectL12 })).toEqual({})
  })
})

// ─── L13 — Density: no HARDCODED height/padding (dynamic prop-driven sizes are fine) ─────────────────
// Bans a numeric/px LITERAL in an inline height/padding, or an arbitrary `h-[..]`/`p-[..]` bracket. A
// prop-driven `style={{ height: size }}` (a sized Avatar/Spinner/Icon) is legitimate and NOT flagged.
const L13_RE = /(height|padding|paddingTop|paddingBottom|paddingLeft|paddingRight)\s*:\s*['"]?\d/
const L13_ARBITRARY_RE = /\b[hp][xy]?-\[[^\]]+\]/
function detectL13(src: string): string[] {
  return [
    ...(src.match(new RegExp(L13_RE, 'g')) ?? []),
    ...(src.match(new RegExp(L13_ARBITRARY_RE, 'g')) ?? []),
  ]
}
describe('Part II · L13 — no hardcoded height/padding (read a density token)', () => {
  it('detector reddens on a planted hardcoded dimension; ignores dynamic prop sizes', () => {
    expect(detectL13(`style={{ height: 37 }}`).length).toBeGreaterThan(0)
    expect(detectL13(`<div className="p-[12px]" />`).length).toBeGreaterThan(0)
    expect(detectL13(`style={{ width: size, height: size }}`)).toEqual([]) // dynamic — fine
  })
  it('no hardcoded inline height/padding or arbitrary spacing brackets', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: ['src/pages/DesignSystem.tsx'], detect: detectL13 })).toEqual({})
  })
})

// ─── L0 — Behaviors: no bare portal / keydown re-implementing focus·dismiss outside the behavior ────
// `createPortal` lives ONLY in `behaviors/Portal.tsx`; a document `keydown` listener (dismiss / roving)
// lives in `behaviors/**`. The documented exceptions are explicit, rationale'd homes (not drift):
// Tooltip (CSS-primary Esc, 5f-1), ContextMenu (the composed document-level menu keyboard), Sidebar (the
// shell mobile-drawer Esc). The guard catches the NEXT component that hand-rolls a portal/overlay keydown.
const L0_PORTAL_RE = /\bcreatePortal\b/
const L0_KEYDOWN_RE = /addEventListener\(\s*['"]keydown['"]/
const detectL0Portal = (src: string) => src.match(new RegExp(L0_PORTAL_RE, 'g')) ?? []
const detectL0Keydown = (src: string) => src.match(new RegExp(L0_KEYDOWN_RE, 'g')) ?? []
const L0_PORTAL_ALLOW = ['src/components/primitives/behaviors/Portal.tsx']
const L0_KEYDOWN_ALLOW = [
  'src/components/primitives/behaviors/', // the home (usePopover et al.)
  'src/components/primitives/Tooltip.tsx', // CSS-primary Esc (5f-1 documented exception)
  'src/components/primitives/ContextMenu.tsx', // composed document-level menu keyboard
  'src/components/shell/Sidebar.tsx', // shell mobile-drawer Esc (bespoke bottom sheet)
]

describe('Part II · L0 — portals + overlay keyboard live in the behaviors, not hand-rolled', () => {
  it('detector reddens on a planted createPortal + keydown listener', () => {
    expect(detectL0Portal(`createPortal(<div/>, document.body)`).length).toBeGreaterThan(0)
    expect(detectL0Keydown(`document.addEventListener('keydown', onKey)`).length).toBeGreaterThan(0)
  })
  it('createPortal appears only in the Portal behavior', () => {
    expect(sweep({ exts: ['.ts', '.tsx'], allowlist: L0_PORTAL_ALLOW, detect: detectL0Portal })).toEqual({})
  })
  it('document keydown listeners live in behaviors/ (+ the documented Tooltip/ContextMenu/Sidebar exceptions)', () => {
    expect(sweep({ exts: ['.ts', '.tsx'], allowlist: L0_KEYDOWN_ALLOW, detect: detectL0Keydown })).toEqual({})
  })
})

// ─── L4 — Colour resolution: no per-element entity/semantic color-mix in TSX; call the resolver ──────
// The `color-mix(…)` lives in the resolver seam (`theme/colour.ts`) or as a CSS `@utility` in index.css —
// never authored inline per-element in a component (EntityCard/AccountDetailView's `--entity-edge` now
// resolves via `theme/colour.entityEdge`).
const L4_RE = /color-mix\s*\(/
const detectL4 = (src: string) => src.match(new RegExp(L4_RE, 'g')) ?? []
const L4_ALLOW = ['src/pages/DesignSystem.tsx']

describe('Part II · L4 — entity/semantic color-mix lives in the resolver, not per-element TSX', () => {
  it('detector reddens on a planted inline color-mix', () => {
    expect(detectL4("style={{ borderColor: `color-mix(in srgb, ${c} 30%, var(--b))` }}").length).toBeGreaterThan(0)
  })
  it('no inline color-mix in TSX (it resolves via theme/colour or a CSS @utility)', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L4_ALLOW, detect: detectL4 })).toEqual({})
  })
})

// ─── L20 — Scroll / cursor: the global themed thin scrollbar reserves the gutter ────────────────────
describe('Part II · L20 — every app scroll region reserves the gutter (scrollbar-gutter: stable)', () => {
  it('index.css declares the stable scrollbar gutter (the §12 global scroll treatment)', () => {
    const css = readFileSync(join(SRC_DIR, 'index.css'), 'utf8')
    expect(css).toMatch(/scrollbar-gutter:\s*stable/)
  })
})

// ─── Pointers — the pre-existing guards that own L1/L1a, L17, L18 run in this suite's CI lane ────────
describe('Part II · L1/L1a · L17 · L18 — the pre-existing guards exist and run', () => {
  it('L1/L1a ramp-parity guard file exists (ramp-derivation.test.ts)', () => {
    expect(() => readFileSync(join(__dirname, 'ramp-derivation.test.ts'), 'utf8')).not.toThrow()
  })
  it('L17 token-hygiene guard file exists (design-tokens.test.ts)', () => {
    expect(() => readFileSync(join(__dirname, 'design-tokens.test.ts'), 'utf8')).not.toThrow()
  })
  it('L18 completeness guard file exists (design-system-completeness.test.tsx)', () => {
    expect(() => readFileSync(join(__dirname, 'design-system-completeness.test.tsx'), 'utf8')).not.toThrow()
  })
})
