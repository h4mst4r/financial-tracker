import { describe, it, expect } from 'vitest'
import { remapEntityColour } from '../src/theme/colour'

const RAMP = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'] // gameboy tintRamp (light → dark)

describe('remapEntityColour — immersive (gameboy)', () => {
  it('maps a light source to a light ramp slot', () => {
    expect(remapEntityColour('#ffffff', 'e1', 'gameboy')).toBe(RAMP[0])
  })

  it('maps a dark source to a dark ramp slot', () => {
    expect(remapEntityColour('#000000', 'e1', 'gameboy')).toBe(RAMP[RAMP.length - 1])
  })

  it('separates colliding entities onto different slots, deterministically', () => {
    const run = (): [string, string] => {
      const taken = new Set<number>()
      const a = remapEntityColour('#ffffff', 'alpha', 'gameboy', taken)
      const b = remapEntityColour('#ffffff', 'bravo', 'gameboy', taken)
      return [a, b]
    }
    const [a1, b1] = run()
    const [a2, b2] = run()
    expect(a1).not.toBe(b1) // collision nudged the second entity
    expect([a1, b1]).toEqual([a2, b2]) // deterministic across runs
  })
})

describe('remapEntityColour — non-immersive (retro)', () => {
  it('returns the source hex unchanged', () => {
    expect(remapEntityColour('#6366f1', 'e1', 'retro')).toBe('#6366f1')
  })
})
