import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import type { Person, NotificationPrefs } from '../../types/auth'

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
  reduceMotion: boolean
  notificationPrefs: Partial<NotificationPrefs>
}>

/**
 * Settings → Profile tab (UX §5.1, FR-P-003, Story 2.9). Personal preferences split into Identity
 * (display name editable; display currency read-only — Story 3.9), Appearance (theme + font),
 * Notifications (per-alert checkboxes), and App (density + reduce-motion). Appearance/App changes
 * apply live through the Epic-1 theming engine (themeStore → useAppearance) and persist immediately;
 * the display name has an explicit Save. Date format is Story 2.11; no colour control (UX §5.1 omits
 * one — D-COLOUR).
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
        <h2 className="text-lg font-medium text-text-primary">Identity</h2>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-name">Display name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="profile-currency">Display currency</Label>
            {/* Read-only here; the per-person display-currency selector is Story 3.9 (D-DISPCCY). */}
            <Input id="profile-currency" value={person.displayCurrency} disabled readOnly />
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
        <h2 className="text-lg font-medium text-text-primary">Appearance</h2>
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
        <h2 className="text-lg font-medium text-text-primary">Notifications</h2>
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
        <h2 className="text-lg font-medium text-text-primary">App</h2>
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
        </div>
      </section>
    </div>
  )
}
