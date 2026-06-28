import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Modal } from './primitives/Modal'
import { Button } from './primitives/Button'
import { Input } from './primitives/Input'
import { Label } from './primitives/Label'
import { Dropdown } from './primitives/Dropdown'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { TIMEZONE_OPTIONS } from '../lib/timezones'
import type { Household } from '../types/auth'

const TZ_OPTIONS = TIMEZONE_OPTIONS

/**
 * First-login owner setup (UX §4.5, FR-HH-001). Auto-shows once when `/auth/me` returns
 * `isFirstLogin: true`; persists household name + timezone via the owner-scoped `PATCH /api/household`.
 * Base currency and date format are deliberately NOT here (Story 2.4c — D-NOBASE / D-DATEFMT).
 * Mounted in App's in-household branch; self-gates via `isFirstLogin`.
 */
export function NewHouseholdModal() {
  const isFirstLogin = useAuthStore((s) => s.isFirstLogin)
  const household = useAuthStore((s) => s.household)
  const setHousehold = useAuthStore((s) => s.setHousehold)
  const dismissFirstLogin = useAuthStore((s) => s.dismissFirstLogin)

  const [name, setName] = useState(household?.name ?? '')
  const [timezone, setTimezone] = useState(household?.timezone ?? 'Asia/Singapore')

  // Save persists name/timezone then stamps setup_completed_at; Skip only stamps it. Both flip
  // `isFirstLogin` false server-side (`POST /api/household/complete-setup`) so a reload doesn't
  // re-open the modal — `dismissFirstLogin` alone is session-local and would not survive a refresh.
  const save = useMutation({
    mutationFn: async () => {
      await api.patch<Household>('/api/household', { name, timezone })
      return (await api.post<Household>('/api/household/complete-setup')).data
    },
    onSuccess: (updated) => {
      setHousehold(updated)
      dismissFirstLogin()
    },
  })

  const skip = useMutation({
    mutationFn: async () => (await api.post<Household>('/api/household/complete-setup')).data,
    onSuccess: (updated) => {
      setHousehold(updated)
      dismissFirstLogin()
    },
  })

  const pending = save.isPending || skip.isPending

  if (!isFirstLogin) return null

  return (
    <Modal
      open
      onClose={() => skip.mutate()}
      title="Set up your household"
      footer={
        <>
          <Button variant="ghost" onClick={() => skip.mutate()} disabled={pending}>
            Skip
          </Button>
          <Button onClick={() => save.mutate()} disabled={pending}>
            Save
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary mb-md">
        We&rsquo;ve created your household with sensible defaults &mdash; adjust them now or change
        later in Settings.
      </p>
      <div className="flex flex-col gap-sm">
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="new-household-name">Household name</Label>
          <Input
            id="new-household-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="new-household-timezone">Timezone</Label>
          <Dropdown
            id="new-household-timezone"
            searchable
            value={timezone}
            options={TZ_OPTIONS}
            onChange={setTimezone}
          />
        </div>
      </div>
    </Modal>
  )
}
