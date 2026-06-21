import { describe, expect, test } from 'vitest'
import {
  isoCurrencyCodes,
  currencyName,
  currencySymbol,
  colourForCode,
  displayRate,
  isStale,
  relativeAge,
  staleHours,
} from '../src/lib/currency'

describe('currency lib', () => {
  test('isoCurrencyCodes returns a non-empty ISO list including USD', () => {
    const codes = isoCurrencyCodes()
    expect(codes.length).toBeGreaterThan(0)
    expect(codes).toContain('USD')
  })

  test('currencyName / currencySymbol resolve from Intl', () => {
    expect(currencyName('USD').length).toBeGreaterThan(0)
    expect(currencyName('USD')).not.toBe('USD') // a real display name, not the bare code
    expect(currencySymbol('USD').length).toBeGreaterThan(0)
  })

  test('currencyName falls back to the code for an unknown code', () => {
    expect(currencyName('ZZZ')).toBe('ZZZ')
  })

  test('colourForCode is deterministic and a hex', () => {
    expect(colourForCode('USD')).toBe(colourForCode('USD'))
    expect(colourForCode('USD')).toMatch(/^#[0-9a-f]{6}$/i)
    // Different codes generally map to different swatches.
    expect(colourForCode('USD')).not.toBe(colourForCode('NZD'))
  })

  test('displayRate shows the inverse "1 base = N target"; base reads "base"', () => {
    expect(displayRate('1.0', 'SGD', 'SGD', true)).toBe('base')
    // rate_to_base 0.78 (NZD→SGD) → 1 SGD = 1.282 NZD
    expect(displayRate('0.78', 'SGD', 'NZD', false)).toBe('1 SGD = 1.282 NZD')
    // Guard against a 0 / non-finite rate.
    expect(displayRate('0', 'SGD', 'NZD', false)).toBe('—')
  })

  test('isStale: null (never) and > 48h are stale; recent is fresh', () => {
    expect(isStale(null)).toBe(true)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()
    expect(isStale(twoHoursAgo)).toBe(false)
    expect(isStale(fiftyHoursAgo)).toBe(true)
  })

  test('relativeAge is the compact "Nh ago" form (Story 3.8)', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(relativeAge(twoHoursAgo)).toBe('2h ago')
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(relativeAge(threeDaysAgo)).toBe('3d ago')
    expect(relativeAge(new Date().toISOString())).toBe('just now')
  })

  test('staleHours is the whole-hours count since the timestamp', () => {
    const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()
    expect(staleHours(fiftyHoursAgo)).toBe(50)
  })

  test('naive backend timestamps (no tz, as SQLite round-trips) are parsed as UTC — no skew', () => {
    // last_rate_at comes back naive (e.g. "2026-06-20T09:00:00") — must be read as UTC, not local.
    const naive = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '')
    expect(relativeAge(naive)).toBe('3h ago')
    expect(staleHours(naive)).toBe(3)
    // And a naive >48h timestamp is stale regardless of the viewer's timezone.
    const naiveStale = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString().replace('Z', '')
    expect(isStale(naiveStale)).toBe(true)
  })
})
