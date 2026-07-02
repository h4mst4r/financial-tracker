import { format, parseISO, parse, isValid } from 'date-fns'
import { useAuthStore } from '../stores/authStore'

/** The per-person date-display preference (FR-P-009, Story 2.11). Display/input ordering only —
 *  stored and transmitted values always stay ISO 8601 (`YYYY-MM-DD`). */
export type DisplayFormat = 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD'

/** Map a `display_format` token to its date-fns pattern. */
const DATE_FNS_PATTERN: Record<DisplayFormat, string> = {
  'DD-MM-YYYY': 'dd-MM-yyyy',
  'MM-DD-YYYY': 'MM-dd-yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
}

const ISO_FORMAT = 'yyyy-MM-dd'
const DEFAULT_DISPLAY_FORMAT: DisplayFormat = 'DD-MM-YYYY'

/** The current person's date format, defaulting to `DD-MM-YYYY` before auth resolves / when unset or
 *  (defensively) when the stored token is not a recognised pattern — never let an unknown token reach
 *  `format()` with an undefined pattern. */
function currentDisplayFormat(): DisplayFormat {
  const stored = useAuthStore.getState().currentPerson?.displayFormat
  return stored && stored in DATE_FNS_PATTERN ? stored : DEFAULT_DISPLAY_FORMAT
}

/**
 * Convert an ISO-8601 date string (`YYYY-MM-DD`) to the given display format, defaulting to the
 * current person's preference. Returns the raw input if parsing fails — callers should validate
 * upstream.
 */
export function formatDateDisplay(iso: string, displayFormat: DisplayFormat = currentDisplayFormat()): string {
  const date = parseISO(iso)
  if (!isValid(date)) return iso
  return format(date, DATE_FNS_PATTERN[displayFormat])
}

/**
 * Parse a user input string in the given display format (default: the current person's preference)
 * back to ISO-8601 (`YYYY-MM-DD`) for storage/transport. Returns null on invalid/unparseable input —
 * never throws.
 */
export function parseDateInput(input: string, displayFormat: DisplayFormat = currentDisplayFormat()): string | null {
  // Accept either `/` or `-` as the separator (UX §DatePicker "a typed date parses") — normalise `/` to
  // the `-` the patterns use, so `15/06/2026` and `15-06-2026` parse identically.
  const date = parse(input.replace(/\//g, '-'), DATE_FNS_PATTERN[displayFormat], new Date())
  if (!isValid(date)) return null
  return format(date, ISO_FORMAT)
}
