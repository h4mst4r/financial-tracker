import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  SRC_DIR,
  sweep,
  detectL6, L6_ALLOW,
  detectL3, L3_ALLOW,
  detectL5,
  detectL11, L11_ALLOW,
  detectL7, L7_ALLOW,
  detectL9, L9_ALLOW,
  detectL10, L10_ALLOW,
  detectL12, L12_ALLOW,
  detectL13, L13_ALLOW,
  detectL0Portal, L0_PORTAL_ALLOW,
  detectL0Keydown, L0_KEYDOWN_ALLOW,
  detectL4, L4_ALLOW,
} from './helpers/enforcement'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Part II — Enforcement (UX §"Part II — Enforcement", L0–L20). The conformance laws as CI guards.
//
// THE GOVERNING LAW (UX Part II lines 320–324; frontend.md §4.1c): ban the VALUE, not the EXAMPLE shape.
// Each guard is proven non-vacuous by a self-test that plants the violation in a NON-OBVIOUS shape (a
// Record value / a ternary / a helper, not just an inline literal) and asserts the detector reddens. The
// detectors + sweep + allowlists now live in tests/helpers/enforcement.ts (shared with the coverage suite
// + the rogue-component battery in enforcement-coverage.test.ts, which proves the whole battery bites a
// real file AND that the source sweep reaches every component).
//
// This file holds the source-scan guards: L0, L3, L4, L5, L6, L7, L9, L10, L11, L12, L13, L20. L8 is an
// `eslint` no-restricted-syntax rule; L14 is `eslint` no-restricted-imports; L15 is `eslint-plugin-jsx-a11y`
// (+ the ramp floor unit); L16/L19 are integration tests (enforcement-l16-keyboard / -l19-data-states).
// L1/L1a, L17, L18 are owned by ramp-derivation.test.ts / design-tokens.test.ts /
// design-system-completeness.test.tsx. L2 = lint/review (N/A here).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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

describe('Part II · L5 — disabled is the `.disabled` utility, not disabled:opacity', () => {
  it('detector reddens on a planted disabled:opacity', () => {
    expect(detectL5(`<button className="disabled:opacity-50">x</button>`).length).toBeGreaterThan(0)
  })
  it('no disabled:opacity-* anywhere', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: [], detect: detectL5 })).toEqual({})
  })
})

describe('Part II · L11 — money/date formatting lives in the value atoms, not call sites', () => {
  it('detector reddens on planted toLocaleString/toFixed (incl. via a helper)', () => {
    expect(detectL11(`const s = amount.toLocaleString()`).length).toBeGreaterThan(0)
    expect(detectL11(`const fmt = (n) => n.toFixed(2)`).length).toBeGreaterThan(0)
  })
  it('no hand-formatted money/date outside lib/ + the value atoms', () => {
    expect(sweep({ exts: ['.ts', '.tsx'], allowlist: L11_ALLOW, detect: detectL11 })).toEqual({})
  })
})

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

describe('Part II · L9 — shadow is a token step, never a raw box-shadow', () => {
  it('detector reddens on a planted raw shadow', () => {
    expect(detectL9(`style={{ boxShadow: '0 1px 2px black' }}`).length).toBeGreaterThan(0)
    expect(detectL9(`<div className="shadow-[0_1px_2px]" />`).length).toBeGreaterThan(0)
  })
  it('no raw box-shadow in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L9_ALLOW, detect: detectL9 })).toEqual({})
  })
})

describe('Part II · L10 — no raw border-width', () => {
  it('detector reddens on a planted raw border width', () => {
    expect(detectL10(`style={{ borderWidth: 3 }}`).length).toBeGreaterThan(0)
    expect(detectL10(`<div className="border-[3px]" />`).length).toBeGreaterThan(0)
  })
  it('no raw border-width in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L10_ALLOW, detect: detectL10 })).toEqual({})
  })
})

describe('Part II · L12 — motion uses --duration/--ease tokens', () => {
  it('detector reddens on a planted raw duration/ease', () => {
    expect(detectL12(`<div className="duration-[200ms]" />`).length).toBeGreaterThan(0)
    expect(detectL12(`<div className="ease-[cubic-bezier(0,0,1,1)]" />`).length).toBeGreaterThan(0)
  })
  it('no raw duration/ease in TSX', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L12_ALLOW, detect: detectL12 })).toEqual({})
  })
})

describe('Part II · L13 — no hardcoded height/padding (read a density token)', () => {
  it('detector reddens on a planted hardcoded dimension; ignores dynamic prop sizes', () => {
    expect(detectL13(`style={{ height: 37 }}`).length).toBeGreaterThan(0)
    expect(detectL13(`<div className="p-[12px]" />`).length).toBeGreaterThan(0)
    expect(detectL13(`style={{ width: size, height: size }}`)).toEqual([]) // dynamic — fine
  })
  it('no hardcoded inline height/padding or arbitrary spacing brackets', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L13_ALLOW, detect: detectL13 })).toEqual({})
  })
})

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

describe('Part II · L4 — entity/semantic color-mix lives in the resolver, not per-element TSX', () => {
  it('detector reddens on a planted inline color-mix', () => {
    expect(detectL4("style={{ borderColor: `color-mix(in srgb, ${c} 30%, var(--b))` }}").length).toBeGreaterThan(0)
  })
  it('no inline color-mix in TSX (it resolves via theme/colour or a CSS @utility)', () => {
    expect(sweep({ exts: ['.tsx'], allowlist: L4_ALLOW, detect: detectL4 })).toEqual({})
  })
})

describe('Part II · L20 — every app scroll region reserves the gutter (scrollbar-gutter: stable)', () => {
  it('index.css declares the stable scrollbar gutter (the §12 global scroll treatment)', () => {
    const css = readFileSync(join(SRC_DIR, 'index.css'), 'utf8')
    expect(css).toMatch(/scrollbar-gutter:\s*stable/)
  })
})
