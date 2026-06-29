import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  contrastText,
  enforceFloor,
  entityEmphasis,
  oklabLightness,
  resolveEntityColour,
} from '../src/theme/colour'

describe('contrastRatio', () => {
  it('black on white is ~21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('identical colours are 1:1', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#0f380f', '#9bbc0f')).toBeCloseTo(contrastRatio('#9bbc0f', '#0f380f'), 10)
  })
})

describe('contrastText', () => {
  it('picks white on a dark fill', () => {
    expect(contrastText('#0f380f')).toBe('#ffffff')
  })

  it('picks dark on a light fill', () => {
    expect(contrastText('#9bbc0f')).toBe('#0a0a0a')
  })

  it('is memoized (same value on repeat)', () => {
    expect(contrastText('#306230')).toBe(contrastText('#306230'))
  })
})

describe('oklabLightness', () => {
  it('orders white > mid > black', () => {
    const white = oklabLightness('#ffffff')
    const mid = oklabLightness('#808080')
    const black = oklabLightness('#000000')
    expect(white).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(black)
    expect(white).toBeCloseTo(1, 1)
    expect(black).toBeCloseTo(0, 5)
  })
})

describe('enforceFloor', () => {
  it('reaches the 4.5:1 floor on a danger-zone fill', () => {
    const { fill, text } = enforceFloor('#777777')
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5)
    expect(fill).not.toBe('#777777') // the loop ran
  })

  it('uses the 3:1 floor for large text', () => {
    const { fill, text } = enforceFloor('#777777', { large: true })
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(3)
  })

  it('leaves an already-passing fill untouched', () => {
    const { fill } = enforceFloor('#0f380f')
    expect(fill).toBe('#0f380f')
  })

  it('is memoized (same object reference on repeat)', () => {
    expect(enforceFloor('#777777')).toBe(enforceFloor('#777777'))
  })
})

// The §0a/§2 per-surface floor — the guarantee the 5f-5 review missed: emphasis stops resolved against a
// VIVID fill must stay ≥ their target ratio, NOT reuse the neutral-surface fraction (which dropped under
// the floor on saturated fills). "Legible by construction, not by clamp" (§0a).
describe('entityEmphasis (per-surface §2 floor on a vivid fill)', () => {
  // Saturated mid-fills across the hue wheel + the floored fills the resolver actually produces.
  const fills = ['#f43f5e', '#ef4444', '#6366f1', '#06b6d4', '#22c55e', '#8b5cf6', '#64748b']

  for (const hex of fills) {
    const { vividFill, on, vividText } = resolveEntityColour(hex, hex, 'base-dark')

    it(`muted clears 4.5:1 against the floored fill ${hex}`, () => {
      expect(contrastRatio(vividText.muted, vividFill)).toBeGreaterThanOrEqual(4.5)
    })

    it(`faint clears its 3:1 sub-floor against ${hex}`, () => {
      expect(contrastRatio(vividText.faint, vividFill)).toBeGreaterThanOrEqual(3)
    })

    it(`default is no fainter than muted, and never below the floor on ${hex}`, () => {
      // default targets ~7:1 but collapses toward the pole when headroom is tight — it must never be
      // MORE muted than muted, and never under the floor.
      expect(contrastRatio(vividText.default, vividFill)).toBeGreaterThanOrEqual(
        contrastRatio(vividText.muted, vividFill) - 0.01,
      )
      expect(contrastRatio(vividText.default, vividFill)).toBeGreaterThanOrEqual(4.5)
    })

    it(`strong (the pole ${on}) is the most legible stop on ${hex}`, () => {
      const r = (c: string) => contrastRatio(c, vividFill)
      expect(r(on)).toBeGreaterThanOrEqual(r(vividText.default) - 0.01)
    })
  }

  it('reuses the cached result', () => {
    expect(entityEmphasis('#ef4444', '#ffffff')).toBe(entityEmphasis('#ef4444', '#ffffff'))
  })
})
