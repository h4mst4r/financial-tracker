import { describe, it, expect } from 'vitest'
import { formatDateDisplay, parseDateInput } from '../src/lib/date'

describe('formatDateDisplay', () => {
  it('converts ISO-8601 to DD-MM-YYYY', () => {
    expect(formatDateDisplay('2026-06-15')).toBe('15-06-2026')
  })

  it('handles the first of the month', () => {
    expect(formatDateDisplay('2026-01-01')).toBe('01-01-2026')
  })

  it('handles year boundaries', () => {
    expect(formatDateDisplay('2025-12-31')).toBe('31-12-2025')
  })

  it('returns raw input for unparseable values', () => {
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date')
  })
})

describe('parseDateInput', () => {
  it('converts DD-MM-YYYY to ISO-8601', () => {
    expect(parseDateInput('15-06-2026')).toBe('2026-06-15')
  })

  it('handles the first of the month', () => {
    expect(parseDateInput('01-01-2026')).toBe('2026-01-01')
  })

  it('returns null for invalid input', () => {
    expect(parseDateInput('not-a-date')).toBeNull()
  })

  it('returns null for impossible dates', () => {
    expect(parseDateInput('32-13-2026')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDateInput('')).toBeNull()
  })

  it('returns null for partial input', () => {
    expect(parseDateInput('15-06')).toBeNull()
  })

  it('round-trips with formatDateDisplay', () => {
    const iso = '2026-06-15'
    const display = formatDateDisplay(iso)
    expect(parseDateInput(display)).toBe(iso)
  })
})
