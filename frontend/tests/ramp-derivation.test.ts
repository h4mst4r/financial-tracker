import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { hexToOklab, mixOklab, luminanceFromOklab, contrastFromLuminance, type Oklab } from './helpers/oklab'

// Story 5F.2 — the §0.11 contrast-floor guard for the DERIVED ramp. The structural ladder + text
// emphasis are computed in CSS via `color-mix(in oklab, …)` from each theme's authored extremes
// (index.css). This test mirrors that OKLab mix in TS and asserts `text-muted` clears the 4.5:1 floor
// on every NON-immersive theme — the §2 "muted IS the floor by construction" guarantee. It parses the
// real index.css inputs, so a change to an extreme/fraction that breaks the floor fails CI.
//
// Game Boy is the documented exception: the DMG green ramp is ~3:1 by nature (even primary text is
// sub-4.5), so muted is floor-EXEMPT there — meaning is carried by icon/shape (§0.2). Asserted as such.

const INDEX_CSS = readFileSync(join(__dirname, '..', 'src', 'index.css'), 'utf8')

/* ── OKLab mix + WCAG contrast: shared test-only re-derivation (tests/helpers/oklab.ts), mirroring CSS
   `color-mix(in oklab, a, b f%)` at full precision — the live-verified ground truth. ── */
const contrast = (x: Oklab, y: Oklab): number =>
  contrastFromLuminance(luminanceFromOklab(x), luminanceFromOklab(y))

/* ── Parse a [data-theme] block's input vars (base-dark lives in @theme; it also carries the dark
   profile-fraction + emphasis defaults the other dark themes inherit). ── */
function themeBlock(theme: string): string {
  if (theme === 'base-dark') {
    const m = INDEX_CSS.match(/@theme\s*\{([\s\S]*?)\n\}/)
    if (!m) throw new Error('@theme block not found')
    return m[1]
  }
  // A theme name can appear in the grouped light-profile selector AND its own block; the standalone
  // block is the one that declares `--ramp-lo`. Collect every matching block body and pick that one.
  const re = new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([\\s\\S]*?)\\n\\}`, 'g')
  const bodies = [...INDEX_CSS.matchAll(re)].map((m) => m[1])
  const own = bodies.find((b) => b.includes('--ramp-lo'))
  if (!own) throw new Error(`theme block (with --ramp-lo) not found: ${theme}`)
  return own
}
function readVar(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim() : undefined
}
const pct = (v: string | undefined) => (v === undefined ? undefined : parseFloat(v) / 100)

// The shared light-profile fractions/pole live in the grouped `[data-theme="base-light"],[data-theme="retro"]`
// selector; resolve a var by walking theme block → light group → @theme (the cascade order).
const LIGHT_GROUP = (() => {
  const m = INDEX_CSS.match(/\[data-theme="base-light"\],\s*\n\s*\[data-theme="retro"\]\s*\{([\s\S]*?)\n\}/)
  return m ? m[1] : ''
})()
function resolve(theme: string, name: string): string | undefined {
  const own = readVar(themeBlock(theme), name)
  if (own !== undefined) return own
  if (theme === 'base-light' || theme === 'retro') {
    const grp = readVar(LIGHT_GROUP, name)
    if (grp !== undefined) return grp
  }
  return readVar(themeBlock('base-dark'), name) // @theme default
}

function mutedVsSurface(theme: string): number {
  const lo = hexToOklab(resolve(theme, '--ramp-lo')!)
  const hi = hexToOklab(resolve(theme, '--ramp-hi')!)
  const surface = mixOklab(lo, hi, pct(resolve(theme, '--f-surface'))!)
  const muted = mixOklab(hexToOklab(resolve(theme, '--text-pole')!), surface, pct(resolve(theme, '--e-text-muted'))!)
  return contrast(muted, surface)
}

describe('5F.2 ramp derivation — §0.11 contrast floor', () => {
  for (const theme of ['base-dark', 'base-light', 'retro', 'brown'] as const) {
    it(`text-muted clears the 4.5:1 floor on ${theme}`, () => {
      expect(mutedVsSurface(theme)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('Game Boy is the documented floor exception (immersive green ramp ~3:1 — meaning via icon/shape, §0.2)', () => {
    // Not a floor failure — an inherent property of a monochrome immersive ramp; asserted so the
    // exemption is explicit and a future change that *raises* it past the floor is noticed.
    expect(mutedVsSurface('gameboy')).toBeLessThan(4.5)
  })
})
