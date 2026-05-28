/**
 * Date formatting utilities.
 * Backend stores dates as ISO 8601 (UTC). Frontend displays in the user's
 * local timezone for a natural personal finance experience.
 */

import { format, parseISO } from 'date-fns'

/**
 * Convert an ISO 8601 datetime string to DD-MM-YYYY display format (local time).
 *
 * @param isoString - ISO 8601 datetime (e.g., "2026-05-28T14:30:00Z")
 * @returns Formatted date string (e.g., "28-05-2026")
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    const date = parseISO(isoString)
    return format(date, 'dd-MM-yyyy')
  } catch {
    return isoString // Fallback to raw string if parsing fails
  }
}

/**
 * Format an ISO datetime to a relative time string (e.g., "2 hours ago").
 * Falls back to DD-MM-YYYY if more than 30 days old.
 */
export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    const date = parseISO(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    if (diffDays < 1) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      if (hours === 0) {
        const minutes = Math.floor(diffMs / (1000 * 60))
        return `${minutes}m ago`
      }
      return `${hours}h ago`
    }
    if (diffDays < 30) {
      return `${Math.floor(diffDays)}d ago`
    }
    return formatDate(isoString)
  } catch {
    return isoString
  }
}

/**
 * Format an ISO datetime to a full display string with time (local time).
 * e.g., "28-05-2026 14:30"
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    const date = parseISO(isoString)
    return format(date, 'dd-MM-yyyy HH:mm')
  } catch {
    return isoString
  }
}
