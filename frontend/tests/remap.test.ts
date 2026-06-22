import { describe, it, expect } from 'vitest'
import {
  remapEntityColour,
  resolveEntityColour,
  contrastRatio,
  enforceTextOnSurface,
} from '../src/theme/colour'

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

describe('resolveEntityColour — the wired seam (SCP 2026-06-22 colour-system-contract)', () => {
  it('immersive: snaps an ARBITRARY user hex (not an entity-type default) onto the ramp', () => {
    // A purple a user picked — never themed before the resolver was wired.
    const { colour } = resolveEntityColour('#7c3aed', 'acct-1', 'gameboy')
    expect(RAMP).toContain(colour)
  })

  it('non-immersive: passes the user hex through untouched', () => {
    expect(resolveEntityColour('#7c3aed', 'acct-1', 'base-dark').colour).toBe('#7c3aed')
  })

  it('vivid fill + its text pole meet the §0.11 contrast floor', () => {
    const { vividFill, on } = resolveEntityColour('#7c3aed', 'acct-1', 'base-dark')
    expect(contrastRatio(on, vividFill)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('enforceTextOnSurface — colour-as-text legibility floor (Currencies code cell)', () => {
  it('darkens a pale colour on a light surface until it passes the floor', () => {
    const surface = '#ffffff'
    const out = enforceTextOnSurface('#ffe08a', surface) // pale yellow, illegible on white
    expect(contrastRatio(out, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('lightens a dark colour on a dark surface until it passes the floor', () => {
    const surface = '#0a0a0a'
    const out = enforceTextOnSurface('#1a1a2e', surface)
    expect(contrastRatio(out, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves an already-legible colour untouched', () => {
    expect(enforceTextOnSurface('#7c3aed', '#ffffff')).toBe('#7c3aed')
  })

  it('passes the colour through when the surface is not a hex (jsdom getComputedStyle)', () => {
    expect(enforceTextOnSurface('#ffe08a', '')).toBe('#ffe08a')
  })
})
