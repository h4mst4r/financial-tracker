import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyWithCode } from './currency'

describe('formatMoney', () => {
  it('formats a positive USD amount', () => {
    expect(formatMoney(1234.56, 'USD')).toBe('$1,234.56')
  })

  it('formats a negative USD amount', () => {
    expect(formatMoney(-987.65, 'USD')).toBe('-$987.65')
  })

  it('formats zero correctly', () => {
    expect(formatMoney(0, 'USD')).toBe('$0.00')
  })

  it('handles null and undefined', () => {
    expect(formatMoney(null)).toBe('')
    expect(formatMoney(undefined)).toBe('')
  })

  it('formats with different currency', () => {
    const result = formatMoney(1000, 'SGD')
    // Intl may not support SGD symbol, so fallback or code prefix is acceptable
    expect(result).toContain('1,000.00')
  })

  it('uses displayCurrency override', () => {
    const result = formatMoney(500, 'SGD', 'USD')
    expect(result).toContain('500.00')
  })

  it('handles large values with many decimals', () => {
    const result = formatMoney(1234567.8912, 'USD')
    expect(result).toContain('1,234,567')
  })
})

describe('formatMoneyWithCode', () => {
  it('formats with explicit currency code prefix', () => {
    expect(formatMoneyWithCode(1234.56, 'SGD')).toBe('SGD 1,234.56')
  })

  it('handles null and undefined', () => {
    expect(formatMoneyWithCode(null, 'SGD')).toBe('')
    expect(formatMoneyWithCode(undefined, 'SGD')).toBe('')
  })

  it('formats zero correctly', () => {
    expect(formatMoneyWithCode(0, 'SGD')).toBe('SGD 0.00')
  })
})
