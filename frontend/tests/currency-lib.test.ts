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
  convertForDisplay,
} from '../src/lib/currency'

const RATES = [
  { code: 'SGD', rate_to_base: '1.0' }, // base
  { code: 'USD', rate_to_base: '1.35' }, // 1 USD = 1.35 SGD
  { code: 'NZD', rate_to_base: '0.78' },
]

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

  test('convertForDisplay: native mode + same-currency pass through unchanged (Story 4.9)', () => {
    expect(convertForDisplay('12840', 'SGD', 'native', RATES)).toEqual({ value: 12840, code: 'SGD' })
    // Display currency == native currency is a no-op convert.
    expect(convertForDisplay('100', 'USD', 'USD', RATES)).toEqual({ value: 100, code: 'USD' })
  })

  test('convertForDisplay: converts native → display via rate_to_base (native × rateN ÷ rateD)', () => {
    // 12840 SGD shown in USD: 12840 × (1.0 / 1.35) = 9511.11…
    const r = convertForDisplay('12840', 'SGD', 'USD', RATES)
    expect(r.code).toBe('USD')
    expect(r.value).toBeCloseTo(9511.111, 2)
    // base identity: a base-currency value shown in base is itself.
    expect(convertForDisplay('500', 'SGD', 'SGD', RATES)).toEqual({ value: 500, code: 'SGD' })
  })

  test('convertForDisplay: missing/zero rate falls back to native (never NaN)', () => {
    // EUR has no rate row → fall back to the native value.
    expect(convertForDisplay('12840', 'SGD', 'EUR', RATES)).toEqual({ value: 12840, code: 'SGD' })
    // A zero display rate would divide-by-zero → native fallback.
    expect(convertForDisplay('12840', 'SGD', 'ZED', [...RATES, { code: 'ZED', rate_to_base: '0' }]))
      .toEqual({ value: 12840, code: 'SGD' })
    // A zero NATIVE rate would multiply to 0 (not native) — guard both sides per the docstring.
    expect(convertForDisplay('12840', 'ZED', 'USD', [...RATES, { code: 'ZED', rate_to_base: '0' }]))
      .toEqual({ value: 12840, code: 'ZED' })
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
