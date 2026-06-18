import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { Modal } from './primitives/Modal'
import { Button } from './primitives/Button'
import { Badge } from './primitives/Badge'
import { Icon } from './primitives/Icon'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

/**
 * NULL-household accept/decline dialog (UX §4.3, FR-P-002/FR-HH-003). Auto-mounts at the app root in
 * the NULL-household branch and self-gates on the store's `pendingInvitation`. Accept joins the
 * household (refetch `/auth/me`, gotcha #4 — not a navigate); Decline is terminal and routes to the
 * Not-Invited page via `clearPendingInvitation`.
 */
export function PendingInvitationDialog() {
  const pendingInvitation = useAuthStore((s) => s.pendingInvitation)
  const household = useAuthStore((s) => s.household)
  const clearPendingInvitation = useAuthStore((s) => s.clearPendingInvitation)
  const queryClient = useQueryClient()

  const token = pendingInvitation?.token

  const accept = useMutation({
    mutationFn: async () => {
      await api.post(`/api/invitations/${token}/accept`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })

  const decline = useMutation({
    mutationFn: async () => {
      await api.post(`/api/invitations/${token}/decline`)
    },
    onSuccess: () => clearPendingInvitation(),
  })

  // Only ever shown to a NULL-household session that carries a pending invite (ARCH §6.5 branch 4).
  if (pendingInvitation == null || household != null) return null

  // Stay disabled after a mutation settles too: Accept keeps the dialog mounted until the `/auth/me`
  // refetch rehydrates `household`, so without `isSuccess` a second click in that window double-POSTs.
  const busy = accept.isPending || decline.isPending || accept.isSuccess || decline.isSuccess

  return (
    <Modal
      open
      onClose={() => {}}
      dismissible={false}
      title="You've been invited"
      footer={
        <>
          <Button variant="ghost" onClick={() => decline.mutate()} disabled={busy}>
            Decline
          </Button>
          <Button onClick={() => accept.mutate()} disabled={busy}>
            Accept
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-sm">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-primary">
          <Icon icon={UserPlus} size={20} />
        </span>
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">
            {pendingInvitation.invitedByDisplayName}
          </span>{' '}
          invited you to join{' '}
          <span className="font-medium text-text-primary">{pendingInvitation.householdName}</span> as
          a <Badge variant="neutral">member</Badge>.
        </p>
      </div>
    </Modal>
  )
}
