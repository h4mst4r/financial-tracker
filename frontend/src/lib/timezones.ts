/**
 * Curated IANA timezones for the New Household (§4.5) / Settings (§5.2) timezone Dropdown.
 * The backend validates against the full `zoneinfo` database (Story 2.4c), so this list is a UX
 * convenience (the common zones), not the validation authority. `Asia/Singapore` is the seeded default.
 */
export const COMMON_TIMEZONES: string[] = [
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Perth',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'UTC',
]

/**
 * `City (offset)` label for a zone, e.g. `Singapore (GMT+8)`, `Los Angeles (PST)`, `Chicago (CST)`.
 * The offset/abbreviation comes from the runtime via `Intl` (`timeZoneName: 'short'`) — US zones
 * yield their abbreviation (PST/CST/EST…), the rest yield `GMT±N`. It reflects the *current* DST
 * state (a display hint, recomputed at load), not the validation authority.
 */
export function timezoneLabel(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  const city = tz.split('/').pop()!.replace(/_/g, ' ')
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value
  return short ? `${city} (${short})` : city
}

/** Ready-made `{ value, label }` options for the timezone Dropdown (value = IANA, label = §above). */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = COMMON_TIMEZONES.map((tz) => ({
  value: tz,
  label: timezoneLabel(tz),
}))
