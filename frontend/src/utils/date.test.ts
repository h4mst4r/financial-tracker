import { describe, it, expect } from 'vitest'
import { formatDate, formatRelativeTime, formatDateTime } from './date'

describe('formatDate', () => {
  it('converts ISO string to DD-MM-YYYY format', () => {
    const result = formatDate('2026-05-28T14:30:00Z')
    // Result is in local timezone, so match the pattern rather than exact value
    expect(result).toMatch(/\d{2}-\d{2}-\d{4}/)
  })

  it('handles null and undefined', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  it('falls back to raw string on parse error', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('formatDateTime', () => {
  it('formats ISO string with date and time', () => {
    const result = formatDateTime('2026-05-28T14:30:00Z')
    // Result is in local timezone, so match the pattern
    expect(result).toMatch(/\d{2}-\d{2}-\d{4} \d{2}:\d{2}/)
  })

  it('handles null and undefined', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
  })
})

describe('formatRelativeTime', () => {
  it('shows minutes ago for recent times', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    expect(formatRelativeTime(recent)).toMatch(/\d+m ago/)
  })

  it('shows hours ago for today', () => {
    const hoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3h ago
    expect(formatRelativeTime(hoursAgo)).toMatch(/\d+h ago/)
  })

  it('shows days ago for recent dates', () => {
    const daysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7d ago
    expect(formatRelativeTime(daysAgo)).toMatch(/\d+d ago/)
  })

  it('shows DD-MM-YYYY for old dates (>30 days)', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60d ago
    expect(formatRelativeTime(oldDate)).toMatch(/\d{2}-\d{2}-\d{4}/)
  })

  it('handles null and undefined', () => {
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
  })
})
