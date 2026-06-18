import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Modal } from './primitives/Modal'
import { Button } from './primitives/Button'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

interface HouseholdConflictDialogProps {
  targetHouseholdName: string
  token: string
}

/**
 * Conflict dialog for an invitee who already belongs to a household (UX §4.4, FR-HH-003). Reached
 * via the `/join/:token` link in-household (D-CONFLICT-ENTRY), never an `/auth/me` push. Copy varies
 * by role; there is **no Accept** — the invitee must delete (owner) or leave (member/admin) first.
 * Decline is terminal; **Go to Settings** only navigates (Leave/Delete are Story 2.7, D-DZ-SEAM).
 */
export function HouseholdConflictDialog({
  targetHouseholdName,
  token,
}: HouseholdConflictDialogProps) {
  const role = useAuthStore((s) => s.currentPerson?.role)
  const currentName = useAuthStore((s) => s.household?.name)
  const navigate = useNavigate()
  const isOwner = role === 'owner'

  const decline = useMutation({
    mutationFn: async () => {
      await api.post(`/api/invitations/${token}/decline`)
    },
    onSuccess: () => navigate('/', { replace: true }),
  })

  const title = isOwner ? 'Already own a household' : 'Already in a household'
  const body = isOwner
    ? `You own ${currentName}. To join ${targetHouseholdName} you must delete your current household first — owners can't simply leave. Or decline.`
    : `You're already in ${currentName}. To join ${targetHouseholdName} you must leave your current household first — go to Settings (your data is archived, restored if you return). Or decline.`

  return (
    <Modal
      open
      onClose={() => navigate('/', { replace: true })}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => decline.mutate()} disabled={decline.isPending}>
            Decline
          </Button>
          <Button onClick={() => navigate('/settings')} disabled={decline.isPending}>
            Go to Settings
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">{body}</p>
    </Modal>
  )
}
