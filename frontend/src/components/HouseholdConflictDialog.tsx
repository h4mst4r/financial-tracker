import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ConfirmationDialog } from './primitives/ConfirmationDialog'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

/**
 * Conflict dialog for an invitee who already belongs to a household (UX §4.4, FR-HH-003). Mounts at
 * the in-household app root and self-gates on the store's `pendingInvitation` (the `/auth/me`
 * conflict-push, ARCH §2.8a / Story 2.6c) — the inverse of `PendingInvitationDialog`, which gates on
 * the NULL-household branch. Copy varies by role; there is **no Accept** — the invitee must delete
 * (owner) or leave (member/admin) first. Decline is terminal; **Go to Settings** only navigates
 * (Leave/Delete live in the Settings Danger Zone, Story 2.7).
 *
 * Dismiss (close or "Go to Settings") hides the dialog for this session via a local flag but does
 * **not** clear `pendingInvitation` — so a still-pending invite re-surfaces on next login, when a
 * fresh `/auth/me` rehydrates the store (UX §4.4 "reappears next login").
 */
export function HouseholdConflictDialog() {
  const pendingInvitation = useAuthStore((s) => s.pendingInvitation)
  const household = useAuthStore((s) => s.household)
  const role = useAuthStore((s) => s.currentPerson?.role)
  const clearPendingInvitation = useAuthStore((s) => s.clearPendingInvitation)
  const navigate = useNavigate()
  // Keyed to the token, not a bare boolean: a dismiss suppresses *this* invite for the session, but a
  // different invite surfacing later (an /auth/me refetch without a reload) is not pre-dismissed.
  const [dismissedToken, setDismissedToken] = useState<string | null>(null)

  const token = pendingInvitation?.token

  const decline = useMutation({
    mutationFn: async () => {
      await api.post(`/api/invitations/${token}/decline`)
    },
    // Terminal: the server marks the invite declined, so clearing locally just closes the dialog and
    // it can never re-surface (unlike a plain dismiss, which leaves it pending).
    onSuccess: () => clearPendingInvitation(),
  })

  // In-household branch only (the opposite of PendingInvitationDialog's NULL-household gate).
  if (pendingInvitation == null || household == null || token === dismissedToken) return null

  const isOwner = role === 'owner'
  const targetHouseholdName = pendingInvitation.householdName
  const currentName = household.name
  const title = isOwner ? 'Already own a household' : 'Already in a household'
  const body = isOwner
    ? `You own ${currentName}. To join ${targetHouseholdName} you must delete your current household first — owners can't simply leave. Or decline.`
    : `You're already in ${currentName}. To join ${targetHouseholdName} you must leave your current household first — go to Settings (your data is archived, restored if you return). Or decline.`

  return (
    <ConfirmationDialog
      open
      // No Accept — Decline (cancel) declines terminally; Go-to-Settings (confirm) navigates. The X
      // (onDismiss) is a SESSION-dismiss — distinct from Decline — so a still-pending invite re-surfaces
      // next login; confirm does not auto-close (it navigates).
      busy={decline.isPending}
      closeOnConfirm={false}
      title={title}
      cancelLabel="Decline"
      confirmLabel="Go to Settings"
      destructive={false}
      message={body}
      onClose={() => decline.mutate()}
      onDismiss={() => setDismissedToken(pendingInvitation.token)}
      onConfirm={() => {
        setDismissedToken(pendingInvitation.token)
        navigate('/settings')
      }}
    />
  )
}
