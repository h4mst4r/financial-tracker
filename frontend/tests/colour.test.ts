import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  contrastText,
  enforceFloor,
  oklabLightness,
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
