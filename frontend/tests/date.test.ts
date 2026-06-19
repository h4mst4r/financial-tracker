import { describe, it, expect } from 'vitest'
import { formatDateDisplay, parseDateInput } from '../src/lib/date'

describe('formatDateDisplay', () => {
  it('defaults to DD-MM-YYYY (no explicit format, no auth)', () => {
    expect(formatDateDisplay('2026-06-15')).toBe('15-06-2026')
  })

  it('handles the first of the month', () => {
    expect(formatDateDisplay('2026-01-01')).toBe('01-01-2026')
  })

  it('handles year boundaries', () => {
    expect(formatDateDisplay('2025-12-31')).toBe('31-12-2025')
  })

  it('formats in MM-DD-YYYY when asked', () => {
    expect(formatDateDisplay('2026-01-15', 'MM-DD-YYYY')).toBe('01-15-2026')
  })

  it('formats in YYYY-MM-DD when asked', () => {
    expect(formatDateDisplay('2026-01-15', 'YYYY-MM-DD')).toBe('2026-01-15')
  })

  it('formats in DD-MM-YYYY when asked explicitly', () => {
    expect(formatDateDisplay('2026-01-15', 'DD-MM-YYYY')).toBe('15-01-2026')
  })

  it('returns raw input for unparseable values', () => {
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date')
  })
})

describe('parseDateInput', () => {
  it('defaults to DD-MM-YYYY → ISO-8601', () => {
    expect(parseDateInput('15-06-2026')).toBe('2026-06-15')
  })

  it('handles the first of the month', () => {
    expect(parseDateInput('01-01-2026')).toBe('2026-01-01')
  })

  it('parses MM-DD-YYYY input back to ISO', () => {
    expect(parseDateInput('01-15-2026', 'MM-DD-YYYY')).toBe('2026-01-15')
  })

  it('parses YYYY-MM-DD input back to ISO', () => {
    expect(parseDateInput('2026-01-15', 'YYYY-MM-DD')).toBe('2026-01-15')
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

  it('round-trips with formatDateDisplay in each format', () => {
    const iso = '2026-06-15'
    for (const fmt of ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'] as const) {
      expect(parseDateInput(formatDateDisplay(iso, fmt), fmt)).toBe(iso)
    }
  })
})
