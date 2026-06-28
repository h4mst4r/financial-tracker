import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Story 5F.2 — the §0.11 contrast-floor guard for the DERIVED ramp. The structural ladder + text
// emphasis are computed in CSS via `color-mix(in oklab, …)` from each theme's authored extremes
// (index.css). This test mirrors that OKLab mix in TS and asserts `text-muted` clears the 4.5:1 floor
// on every NON-immersive theme — the §2 "muted IS the floor by construction" guarantee. It parses the
// real index.css inputs, so a change to an extreme/fraction that breaks the floor fails CI.
//
// Game Boy is the documented exception: the DMG green ramp is ~3:1 by nature (even primary text is
// sub-4.5), so muted is floor-EXEMPT there — meaning is carried by icon/shape (§0.2). Asserted as such.

const INDEX_CSS = readFileSync(join(__dirname, '..', 'src', 'index.css'), 'utf8')

/* ── OKLab mix, mirroring CSS `color-mix(in oklab, a, b f%)` (f = fraction of b) ── */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => lin(v / 255)) as [number, number, number]
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}
type Oklab = [number, number, number]
/** color-mix(in oklab, a, b f%) — f is the fraction (0..1) of b. Stays in OKLab (no sRGB round-trip,
 *  so it matches the browser's `color-mix(in oklab)` to full precision — the live-verified ground truth). */
function mixOklab(A: Oklab, B: Oklab, f: number): Oklab {
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]
}
/** WCAG relative luminance of an OKLab colour (OKLab → linear sRGB → luminance, gamut-clamped). */
function luminance([L, a, b]: Oklab): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const cl = (v: number) => Math.max(0, Math.min(1, v))
  const r = cl(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = cl(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const bl = cl(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}
function contrast(x: Oklab, y: Oklab): number {
  const lx = luminance(x)
  const ly = luminance(y)
  const [hi, lo] = lx >= ly ? [lx, ly] : [ly, lx]
  return (hi + 0.05) / (lo + 0.05)
}

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
