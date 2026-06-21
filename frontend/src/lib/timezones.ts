/**
 * IANA timezones for the New Household (§4.5) / Settings (§5.2) searchable timezone Dropdown.
 * The full zone list comes from the runtime (`Intl.supportedValuesOf('timeZone')`) — no bundled
 * zone data — so the picker offers every zone, searchable. The backend validates against the full
 * `zoneinfo` database (Story 2.4c), so this is the convenience surface, not the validation authority.
 * `Asia/Singapore` is the seeded default. Empty on older runtimes without `supportedValuesOf`.
 */
function ianaTimezones(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
}

/**
 * `City (GMT±N)` label for a zone, e.g. `Singapore (GMT+8)`, `New York (GMT-4)`. The offset comes
 * from the runtime via `Intl` (`timeZoneName: 'shortOffset'`) so EVERY zone reads as a GMT offset —
 * never an abbreviation (EDT/PST/CST), which people conflate with the zone itself. It reflects the
 * *current* DST state (a display hint, recomputed at load), not the validation authority.
 */
export function timezoneLabel(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  const city = tz.split('/').pop()!.replace(/_/g, ' ')
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value
  return offset ? `${city} (${offset})` : city
}

/**
 * Ready-made options for the searchable timezone Dropdown (value = IANA id, label = §above).
 * `searchText` includes the raw IANA id so typing a region/country segment (e.g. "Asia", "Pacific")
 * filters too, not just the city label.
 */
export const TIMEZONE_OPTIONS: { value: string; label: string; searchText: string }[] = ianaTimezones().map(
  (tz) => {
    const label = timezoneLabel(tz)
    return { value: tz, label, searchText: `${tz} ${label}` }
  },
)
