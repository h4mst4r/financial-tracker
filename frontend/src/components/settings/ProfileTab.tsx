import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Input } from '../primitives/Input'
import { Label } from '../primitives/Label'
import { Dropdown } from '../primitives/Dropdown'
import { ThemePicker } from '../primitives/ThemePicker'
import { Toggle } from '../primitives/Toggle'
import { Checkbox } from '../primitives/Checkbox'
import { Button } from '../primitives/Button'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { useAlertStore } from '../../stores/alertStore'
import { api } from '../../api/client'
import { FONT_OPTIONS } from '../../theme/palettes'
import type { ThemeId, FontId } from '../../theme/palettes'
import type { DisplayFormat } from '../../lib/date'
import { NATIVE_DISPLAY } from '../../lib/currency'
import type { Person, NotificationPrefs } from '../../types/auth'
import type { Currency } from '../../types/currency'
import type { ListResponse } from '../../types/household'

/** The three date-format orderings (FR-P-009, Story 2.11) — label == token. */
const DATE_FORMAT_OPTIONS: { value: DisplayFormat; label: string }[] = [
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
]

/** The six alert types (UX §5.1 / bible §5.1), in render order. */
const NOTIFICATION_FIELDS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'budgetWarnings', label: 'Budget warnings' },
  { key: 'budgetOverruns', label: 'Budget overruns' },
  { key: 'missedRecurring', label: 'Missed recurring' },
  { key: 'upcomingPayments', label: 'Upcoming payments' },
  { key: 'fxStale', label: 'FX stale' },
  { key: 'backups', label: 'Backups' },
]

/** A partial body for `PATCH /api/profile` (Story 2.9). */
type ProfilePatch = Partial<{
  displayName: string
  theme: ThemeId
  font: FontId
  density: 'comfortable' | 'compact'
  displayFormat: DisplayFormat
  displayCurrency: string
  reduceMotion: boolean
  notificationPrefs: Partial<NotificationPrefs>
}>

/**
 * Settings → Profile tab (UX §5.1, FR-P-003, Story 2.9). Personal preferences split into Identity
 * (display name + display-currency picker — the latter Story 3.9, FR-CU-004), Appearance (theme + font),
 * Notifications (per-alert checkboxes), and App (density + reduce-motion). Appearance/App changes
 * apply live through the Epic-1 theming engine (themeStore → useAppearance) and persist immediately;
 * the display name has an explicit Save. The App date format (Story 2.11) persists per person and is
 * read by lib/date.ts (storage stays ISO 8601). No colour control (UX §5.1 omits one — D-COLOUR).
 */
export function ProfileTab() {
  const person = useAuthStore((s) => s.currentPerson)
  const setCurrentPerson = useAuthStore((s) => s.setCurrentPerson)
  const pushToast = useAlertStore((s) => s.pushToast)

  const theme = useThemeStore((s) => s.theme)
  const font = useThemeStore((s) => s.font)
  const density = useThemeStore((s) => s.density)
  const reduceMotion = useThemeStore((s) => s.reduceMotion)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setFont = useThemeStore((s) => s.setFont)
  const setDensity = useThemeStore((s) => s.setDensity)
  const setReduceMotion = useThemeStore((s) => s.setReduceMotion)

  const [name, setName] = useState(person?.displayName ?? '')

  // The display-currency picker offers the household's display-active currencies (FR-CU-004). Same
  // query key as the Currencies page so it shares the cache.
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<ListResponse<Currency>>('/api/currencies')).data,
  })
  // Native (each figure in its own account currency) is the first option — same lens the topbar picker
  // offers (Story 4.9); both write Person.display_currency, so the profile picker must render 'native'.
  const currencyOptions = [
    { value: NATIVE_DISPLAY, label: 'Native' },
    ...(currencies?.items ?? [])
      .filter((c) => c.is_display_active)
      .map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` })),
  ]

  const save = useMutation({
    mutationFn: async (body: ProfilePatch) => (await api.patch<Person>('/api/profile', body)).data,
    onSuccess: (updated) => setCurrentPerson(updated),
  })

  // AppShell only mounts in the in-household branch, so currentPerson is non-null; guard defensively.
  if (!person) return null

  const dirtyName = name.trim() !== (person.displayName ?? '') && name.trim().length > 0

  function saveName() {
    save.mutate({ displayName: name.trim() }, { onSuccess: () => pushToast({ message: 'Profile saved', variant: 'success' }) })
  }

  function pickTheme(next: ThemeId) {
    setTheme(next) // live re-render via useAppearance
    save.mutate({ theme: next })
  }
  function pickFont(next: string) {
    setFont(next as FontId)
    save.mutate({ font: next as FontId })
  }
  function toggleDensity(compact: boolean) {
    const next = compact ? 'compact' : 'comfortable'
    setDensity(next)
    save.mutate({ density: next })
  }
  function toggleReduceMotion(next: boolean) {
    setReduceMotion(next)
    save.mutate({ reduceMotion: next })
  }
  function pickDateFormat(next: string) {
    // No themeStore involvement — lib/date.ts reads displayFormat from currentPerson, which the
    // mutation's onSuccess (setCurrentPerson) refreshes. Persist only.
    save.mutate({ displayFormat: next as DisplayFormat })
  }
  function pickDisplayCurrency(next: string) {
    // Render-time preference only (FR-P-004) — never touches stored amount_base. onSuccess refreshes
    // currentPerson; the topbar picker (Story 4.9) is the twin control and the accounts hero now
    // converts live to this. Same value space as the topbar — 'native' or a display-active code.
    save.mutate(
      { displayCurrency: next },
      { onSuccess: () => pushToast({ message: 'Display currency updated', variant: 'success' }) },
    )
  }
  function toggleNotification(key: keyof NotificationPrefs, next: boolean) {
    // Send only the changed key — the backend merges over the stored set. Sending the full render-time
    // snapshot would let a rapid second toggle of another key clobber the first (lost update).
    const notificationPrefs: Partial<NotificationPrefs> = { [key]: next }
    save.mutate({ notificationPrefs })
  }

  return (
    <div className="flex flex-col gap-xl">
      {/* Identity */}
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-medium text-text-strong">Identity</h2>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-name">Display name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-currency">Display currency</Label>
            {/* Per-person display currency (Story 3.9, FR-CU-004) — the household's display-active
                currencies; persists on pick. While the list loads, show the current value disabled. */}
            {currencyOptions.length > 0 ? (
              <Dropdown
                id="profile-currency"
                value={person.displayCurrency}
                options={currencyOptions}
                onChange={pickDisplayCurrency}
              />
            ) : (
              <Input id="profile-currency" value={person.displayCurrency} disabled readOnly />
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveName} disabled={!dirtyName || save.isPending}>
            Save
          </Button>
        </div>
      </section>

      {/* Appearance */}
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-medium text-text-strong">Appearance</h2>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-theme">Theme</Label>
            <ThemePicker id="profile-theme" value={theme} onChange={pickTheme} />
          </div>
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-font">Font</Label>
            <Dropdown id="profile-font" value={font} options={FONT_OPTIONS} onChange={pickFont} />
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-medium text-text-strong">Notifications</h2>
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          {NOTIFICATION_FIELDS.map(({ key, label }) => (
            <Checkbox
              key={key}
              id={`notify-${key}`}
              label={label}
              checked={person.notificationPrefs[key]}
              onChange={(next) => toggleNotification(key, next)}
            />
          ))}
        </div>
      </section>

      {/* App */}
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-medium text-text-strong">App</h2>
        <div className="flex flex-wrap items-center gap-xl">
          <div className="flex items-center gap-sm">
            <Label htmlFor="profile-density">Density (compact)</Label>
            <Toggle
              id="profile-density"
              aria-label="Compact density"
              checked={density === 'compact'}
              onChange={toggleDensity}
            />
          </div>
          <div className="flex items-center gap-sm">
            <Label htmlFor="profile-reduce-motion">Reduce motion</Label>
            <Toggle
              id="profile-reduce-motion"
              aria-label="Reduce motion"
              checked={reduceMotion}
              onChange={toggleReduceMotion}
            />
          </div>
          {/* Fixed width (bible §5.1 App, ~160px): the wrapping toggle row would otherwise shrink this
              field to content width, cramping the w-full Dropdown trigger onto two lines. */}
          <div className="flex w-44 flex-col gap-2xs">
            <Label htmlFor="profile-date-format">Date format</Label>
            <Dropdown
              id="profile-date-format"
              value={person.displayFormat}
              options={DATE_FORMAT_OPTIONS}
              onChange={pickDateFormat}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
