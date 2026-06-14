import { format, parseISO, parse, isValid } from 'date-fns'

const DISPLAY_FORMAT = 'dd-MM-yyyy'
const ISO_FORMAT = 'yyyy-MM-dd'

/**
 * Convert an ISO-8601 date string (YYYY-MM-DD) to the display format DD-MM-YYYY.
 * Returns the raw input if parsing fails — callers should validate upstream.
 */
export function formatDateDisplay(iso: string): string {
  const date = parseISO(iso)
  if (!isValid(date)) return iso
  return format(date, DISPLAY_FORMAT)
}

/**
 * Parse a DD-MM-YYYY user input string back to ISO-8601 (YYYY-MM-DD).
 * Returns null on invalid/unparseable input — never throws.
 */
export function parseDateInput(input: string): string | null {
  const date = parse(input, DISPLAY_FORMAT, new Date())
  if (!isValid(date)) return null
  return format(date, ISO_FORMAT)
}
