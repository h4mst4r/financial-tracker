import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { PALETTES } from '../src/theme/palettes'

// Anti-drift guard (CLAUDE.md P5). Spec defines concrete values → tests enforce → /design-system demos.
// Story 5f-8 retired the design bible as the visual arbiter: this test replaces the old bible.css ↔
// index.css diff with a direct SPEC ↔ index.css token-parity check. The UX spec (§6 accents · §4
// semantic · §9 chart series) is now the sole arbiter — but it expresses colour as an OKLCH derivation
// MODEL + token ROLES, not literal hexes (it contains zero hex values by design). So the authored anchor
// values these roles resolve to are pinned HERE as the canonical drift record, cited to the governing
// spec sections; index.css must match. A diff trips this test → reconcile to the spec (update both the
// pin and index.css together — never silently).
//
// [Source: ux-design-specification.md §6 (accents — per-theme: accent-primary/secondary), §4 (semantic
//  — success/warning/error/info: "global defaults, not per-theme"; a [data-theme] may override only for
//  harmony), §9 / §0.2 Viz series (chart-1…8 — global default; immersive override optional).]
//
// NOT pinned here (owned elsewhere, per the bible-era split carried forward):
//  • Structural ladder · text emphasis · shadows — DERIVED in index.css since 5f-2 (color-mix/calc from
//    each theme's §0 extremes), guarded by ramp-derivation.test.ts (L1/L1a). Not re-pinned.
//  • entity-* colours — a different model per surface (resolver-remapped per instance).
//  • derived alpha tokens (fills/rings/subtle/backdrop) — color-mix/rgba, syntax-dependent.

const INDEX_CSS = join(__dirname, '..', 'src', 'index.css')

// base-dark authors its anchors in `@theme {…}`; the immersive/alt themes override in `[data-theme]`
// blocks. A theme that does NOT pin a token inherits base-dark (e.g. base-light keeps the base chart
// hues unless it overrides them); the test only asserts the tokens a theme actually authors.
const THEMES = ['base-dark', 'base-light', 'retro', 'brown', 'gameboy'] as const
type Theme = (typeof THEMES)[number]

// The pinned anchor record — the values the spec's roles resolve to (authored in index.css). Per theme,
// only the tokens that theme AUTHORS (the rest inherit base-dark and are asserted under base-dark).
const PINNED_ANCHORS: Record<Theme, Record<string, string>> = {
  'base-dark': {
    'accent-primary': '#6366f1', 'accent-secondary': '#06b6d4',
    success: '#22c55e', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
    'chart-1': '#6366f1', 'chart-2': '#06b6d4', 'chart-3': '#22c55e', 'chart-4': '#f59e0b',
    'chart-5': '#ec4899', 'chart-6': '#8b5cf6', 'chart-7': '#14b8a6', 'chart-8': '#f43f5e',
  },
  'base-light': {
    'accent-primary': '#4f46e5', 'accent-secondary': '#0891b2',
    success: '#16a34a', warning: '#d97706', error: '#dc2626', info: '#2563eb',
    'chart-1': '#4f46e5', 'chart-2': '#0891b2', 'chart-3': '#16a34a', 'chart-4': '#d97706',
    'chart-5': '#db2777', 'chart-6': '#7c3aed', 'chart-7': '#0d9488', 'chart-8': '#e11d48',
  },
  retro: {
    'accent-primary': '#d2691e', 'accent-secondary': '#2a9d8f',
    success: '#5b8c3a', warning: '#cc8a2c', error: '#c0392b', info: '#3d7b8c',
    'chart-1': '#d2691e', 'chart-2': '#2a9d8f', 'chart-3': '#c0392b', 'chart-4': '#e9c46a',
    'chart-5': '#8a5a44', 'chart-6': '#6a994e', 'chart-7': '#bc6c25', 'chart-8': '#457b9d',
  },
  brown: {
    'accent-primary': '#b08968', 'accent-secondary': '#9c6644',
    success: '#7fa05a', warning: '#d99a4e', error: '#d9534f', info: '#6a9bb0',
    'chart-1': '#b08968', 'chart-2': '#9c6644', 'chart-3': '#7fa05a', 'chart-4': '#d9a441',
    'chart-5': '#c97b5a', 'chart-6': '#6a9bb0', 'chart-7': '#a8855f', 'chart-8': '#cf6b4a',
  },
  gameboy: {
    'accent-primary': '#8bac0f', 'accent-secondary': '#9bbc0f',
    success: '#9bbc0f', warning: '#8bac0f', error: '#9bbc0f', info: '#8bac0f',
    'chart-1': '#9bbc0f', 'chart-2': '#7a9a1a', 'chart-3': '#5e8226', 'chart-4': '#306230',
    'chart-5': '#214c21', 'chart-6': '#8bac0f', 'chart-7': '#486f24', 'chart-8': '#143d14',
  },
}

/** Every `--color-<name>: #hex` authored for a theme, merged across ALL of that theme's blocks (base-dark
 *  = the `@theme {…}` block(s); the rest = the `[data-theme="…"] {…}` block(s) — some themes split their
 *  §0-inputs and their anchor overrides into two rule blocks). No nested braces inside these blocks. */
function colorHexTokens(css: string, theme: Theme): Map<string, string> {
  const out = new Map<string, string>()
  const blockRe =
    theme === 'base-dark'
      ? /@theme\s*\{([\s\S]*?)\n\}/g
      : new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'g')
  const tokenRe = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g
  let found = false
  for (const block of css.matchAll(blockRe)) {
    found = true
    for (const m of block[1].matchAll(tokenRe)) out.set(m[1], m[2].toLowerCase())
  }
  if (!found) throw new Error(`no token block found for theme: ${theme}`)
  return out
}

describe('UX spec ↔ index.css anchor token parity (§6 accents · §4 semantic · §9 chart)', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')

  it('self-test: the extractor finds a known authored anchor in index.css', () => {
    // (structural surface tones are DERIVED — pin a still-authored anchor as the canary.)
    expect(colorHexTokens(indexCss, 'base-dark').get('accent-primary')).toBe('#6366f1')
    expect(colorHexTokens(indexCss, 'retro').get('accent-primary')).toBe('#d2691e')
  })

  for (const theme of THEMES) {
    it(`index.css matches the pinned spec anchors — ${theme}`, () => {
      const authored = colorHexTokens(indexCss, theme)
      const mismatches: Record<string, { pinned: string; index?: string }> = {}
      for (const [name, pinned] of Object.entries(PINNED_ANCHORS[theme])) {
        const indexVal = authored.get(name)
        if (indexVal !== pinned) mismatches[name] = { pinned, index: indexVal }
      }
      expect(mismatches).toEqual({})
    })
  }
})

// Radius scale (§8) and the primary font families are also spec-governed concrete values — pin them so
// they can't silently drift (the colour map above is not the whole P5 surface). The typography scale,
// 8px spacing scale, z-index scale and breakpoints are governed in UX §0.3/§0.4/§0.10 and tested by
// design-tokens.test.ts / their own utilities; they are not re-pinned here.

/** Raw (non-hex) token value: name (after `--`) → whitespace-normalised value, scanned over the file. */
function rawToken(css: string, name: string): string | undefined {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim().replace(/\s+/g, ' ') : undefined
}

/** First (primary) font family in a stack, unquoted — the spec-pinned family. */
function primaryFamily(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const m = value.match(/^\s*['"]?([^'",]+)/)
  return m ? m[1].trim() : undefined
}

describe('UX spec ↔ index.css — radius / font parity', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')

  // [Source: ux-design-specification.md §8 radius scale = sm/md/lg/xl/full (2xl is NOT in the scale —
  //  FRONTEND-AUDIT N2, cut 5f-6).]
  const PINNED_RADIUS: Record<string, string> = {
    'radius-sm': '4px', 'radius-md': '8px', 'radius-lg': '12px', 'radius-xl': '16px',
  }
  it('radius scale matches the spec', () => {
    const mismatches: Record<string, { pinned: string; index?: string }> = {}
    for (const [name, pinned] of Object.entries(PINNED_RADIUS)) {
      const indexVal = rawToken(indexCss, name)
      if (indexVal !== pinned) mismatches[name] = { pinned, index: indexVal }
    }
    expect(mismatches).toEqual({})
  })

  // [Source: ux-design-specification.md §0.3 type — Inter (sans) / JetBrains Mono (mono); fallback
  //  stacks are environment-tuned, not pinned.]
  it('primary font families match the spec', () => {
    expect(primaryFamily(rawToken(indexCss, 'font-sans'))).toBe('Inter')
    expect(primaryFamily(rawToken(indexCss, 'font-mono'))).toBe('JetBrains Mono')
  })

  // [Source: ux-design-specification.md §17 — the mobile bottom-nav bar is fixed chrome of height
  //  --nav-mobile-h (48px, ≥ the 44px touch floor); drives the < md <main> inset + bulk-bar offset +
  //  toast clearance (5f-11 D1). Pinned so the chrome height can't silently drift.]
  it('mobile bottom-nav height matches the spec (§17 — 48px, ≥ 44px touch floor)', () => {
    expect(rawToken(indexCss, 'nav-mobile-h')).toBe('48px')
  })

  // [Source: ux-design-specification.md §9 — modal-tier backdrop = "dim + blur 4px"; blur is modal-only
  //  (FRONTEND-AUDIT D10). The radius is a single global token; pin it so it can't silently drift.]
  it('modal backdrop blur radius matches the spec (§9 — 4px, modal-only)', () => {
    expect(rawToken(indexCss, 'backdrop-blur')).toBe('4px')
  })

  // [Source: ux-design-specification.md §9 — the blur is a transparency effect and honours the OS
  //  prefers-reduced-transparency setting (collapses to 0, dim scrim kept). Guard the toggle so it can't
  //  be silently dropped.]
  it('modal blur honours prefers-reduced-transparency (collapses to 0px)', () => {
    expect(indexCss).toMatch(/@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{[^}]*--backdrop-blur:\s*0px/)
  })

  // Shadows are DERIVED in index.css since 5f-2 (each step's alpha lerps the per-theme --shadow-lo/-hi
  // via calc(); offset/blur geometry is global). The geometry is still authored — pin it so it can't
  // drift (the per-theme opacity is owned by ramp-derivation.test.ts).
  it('shadow geometry (offset/blur) is intact (the per-theme opacity is derived, §9/B15)', () => {
    expect(rawToken(indexCss, 'shadow-sm')).toContain('0 1px 2px')
    expect(rawToken(indexCss, 'shadow-md')).toContain('0 2px 8px')
    expect(rawToken(indexCss, 'shadow-lg')).toContain('0 8px 24px')
    expect(rawToken(indexCss, 'shadow-xl')).toContain('0 16px 48px')
  })
})

// ── FRONTEND-AUDIT F8 — immersive tint/tintRamp: TS ↔ CSS single-source parity ──────────────────────
// The immersive remap reads `tint`/`tintRamp` from theme/palettes.ts (the JS engine's snap ramp) while the
// [data-theme] block in index.css authors what the theme actually renders. If they diverge, the resolver
// snaps entity colours to a ramp the theme doesn't paint (the "split source of truth" F8 flagged). Assert
// every JS ramp hex is authored somewhere in the matching index.css theme block.

/** Concatenated text of every `[data-theme="<theme>"] { … }` block (a theme may split §0 inputs + anchors
 *  across blocks). No nested braces inside these blocks. */
function themeBlockText(css: string, theme: string): string {
  const re = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(re)].map((m) => m[1]).join('\n')
}

describe('immersive tint/tintRamp — theme/palettes.ts ↔ index.css parity (FRONTEND-AUDIT F8)', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')

  it('self-test: the block extractor finds the gameboy anchor', () => {
    expect(themeBlockText(indexCss, 'gameboy').toLowerCase()).toContain('#8bac0f')
  })

  for (const [theme, meta] of Object.entries(PALETTES)) {
    if (!meta.immersive) continue
    it(`every palettes.ts tint/tintRamp hex is authored in the ${theme} theme block`, () => {
      const block = themeBlockText(indexCss, theme).toLowerCase()
      const jsHexes = [meta.tint, ...(meta.tintRamp ?? [])].filter((h): h is string => !!h).map((h) => h.toLowerCase())
      expect(jsHexes.length).toBeGreaterThan(0) // an immersive palette must declare its ramp
      const missing = jsHexes.filter((h) => !block.includes(h))
      expect(missing).toEqual([])
    })
  }
})

// ── FRONTEND-AUDIT F9/D8 — compact density: the §15 transform is spec-locked, pin it ────────────────
// [Source: ux-design-specification.md §15 Density — compact = a transform on the comfortable tokens:
//  control/row heights ×0.8, vertical padding −1 spacing step (e.g. control-height 40→32, py xs→2xs).]
// The core transform (control-height + vertical padding) is spec-exemplar'd, so pin it here against drift.
// NOT pinned (residual spec-gap, escalated to UX): the compact toggle geometry + compact row-gap, which
// index.css:393 itself labels "no bible exemplar" — the systematized spec has no locked value for them.

/** A token read WITHIN a specific selector block (the same token name lives in `:root` and the compact
 *  block, so a whole-file scan would return the wrong tier). Returns the value in the first block matching
 *  the selector that declares the token. No nested braces inside these blocks. */
function scopedToken(css: string, selector: string, name: string): string | undefined {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const m of css.matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    const t = m[1].match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
    if (t) return t[1].trim()
  }
  return undefined
}

describe('UX spec ↔ index.css — compact density transform parity (§15, FRONTEND-AUDIT F9/D8)', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')

  it('self-test: the scoped reader distinguishes the comfortable vs compact tier', () => {
    expect(scopedToken(indexCss, ':root', 'control-height')).toBe('40px')
    expect(scopedToken(indexCss, '[data-density="compact"]', 'control-height')).toBe('32px')
  })

  it('comfortable (default tier) — control-height 40 / vertical padding 8', () => {
    expect(scopedToken(indexCss, ':root', 'control-height')).toBe('40px')
    expect(scopedToken(indexCss, ':root', 'control-padding-y')).toBe('8px')
  })

  it('compact = ×0.8 control-height (40→32) + −1-step vertical padding (xs 8 → 2xs 4) [§15]', () => {
    expect(scopedToken(indexCss, '[data-density="compact"]', 'control-height')).toBe('32px')
    expect(scopedToken(indexCss, '[data-density="compact"]', 'control-padding-y')).toBe('4px')
  })

  it('compact row-gap = −1 step, on-scale (xs 8 → 2xs 4) [§15, FRONTEND-AUDIT F9]', () => {
    expect(scopedToken(indexCss, ':root', 'density-row-gap')).toBe('8px')
    expect(scopedToken(indexCss, '[data-density="compact"]', 'density-row-gap')).toBe('4px')
  })

  it('compact toggle = track-w & thumb ×0.8, track-h/travel derived (2px inset) [§15]', () => {
    // free values (×0.8): track-w 40→32, thumb 20→16
    expect(scopedToken(indexCss, '[data-density="compact"]', 'toggle-track-w')).toBe('32px')
    expect(scopedToken(indexCss, '[data-density="compact"]', 'toggle-thumb')).toBe('16px')
    // derived: track-h = thumb + 2·inset = 20; travel = track-w − thumb − 2·inset = 12
    expect(scopedToken(indexCss, '[data-density="compact"]', 'toggle-track-h')).toBe('20px')
    expect(scopedToken(indexCss, '[data-density="compact"]', 'toggle-thumb-travel')).toBe('12px')
  })
})
