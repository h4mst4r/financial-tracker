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
