import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ACTION_ICON } from '../config/iconRegistry'
import { ConfirmationDialog } from './primitives/ConfirmationDialog'
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
    <ConfirmationDialog
      open
      // A mandatory choice with no surface behind it — no X / Escape / backdrop dismissal.
      dismissible={false}
      // Decline = cancel, Accept = confirm (non-destructive). Accept does NOT auto-close: the dialog
      // stays mounted until the `/auth/me` refetch rehydrates `household` (gotcha #4 — not a navigate).
      busy={busy}
      closeOnConfirm={false}
      title="You've been invited"
      cancelLabel="Decline"
      confirmLabel="Accept"
      destructive={false}
      onClose={() => decline.mutate()}
      onConfirm={() => accept.mutate()}
      message={
        <div className="flex items-start gap-sm">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-primary">
            <Icon icon={ACTION_ICON.invite} size={20} />
          </span>
          <span>
            <span className="font-medium text-text-strong">
              {pendingInvitation.invitedByDisplayName}
            </span>{' '}
            invited you to join{' '}
            <span className="font-medium text-text-strong">{pendingInvitation.householdName}</span>{' '}
            as a <Badge variant="neutral">member</Badge>.
          </span>
        </div>
      }
    />
  )
}
