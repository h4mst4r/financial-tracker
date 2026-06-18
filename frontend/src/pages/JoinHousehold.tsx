import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { PublicPage } from '../components/PublicPage'
import { PublicError } from './public/PublicError'
import { Button } from '../components/primitives/Button'
import { Badge } from '../components/primitives/Badge'
import { Avatar } from '../components/primitives/Avatar'
import { HouseholdConflictDialog } from '../components/HouseholdConflictDialog'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import type { InvitationValidation } from '../types/household'

/** Start the Google OAuth flow — a real navigation to the backend (mirrors Login). The URL token is
 *  NOT threaded through OAuth; `seed_household_if_needed` matches the pending invite by email (gotcha #2). */
function continueWithGoogle() {
  window.location.href = '/auth/login'
}

/**
 * `/join/:token` landing (UX §4.1a, ARCH §6.5/§6.6). Reachable unauthenticated, NULL-household, and
 * in-household. Validates the token (public 200-always endpoint — never 401, gotcha #1) and branches:
 * invalid → Invite-expired; valid+logged-out → invite-context card + Continue with Google;
 * valid+logged-in+no-household → hand off to the root PendingInvitationDialog; valid+logged-in+
 * with-household → the conflict dialog (or invalid on email mismatch).
 */
export function JoinHousehold() {
  const { token } = useParams<{ token: string }>()
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const household = useAuthStore((s) => s.household)

  const { data, isPending } = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () =>
      (await api.get<InvitationValidation>(`/api/invitations/${token}`)).data,
  })

  if (isPending) return <PublicError state="loading" />
  if (!data || data.status !== 'pending') return <PublicError state="invalid_invitation" />

  // (b) logged-out → the invite-context card + Continue with Google (the URL token only powers this
  // context — the post-OAuth dialog is driven by the store's pendingInvitation, gotcha #2).
  if (currentPerson == null) {
    return (
      <PublicPage
        header={<Avatar name={data.invitedByDisplayName ?? '?'} size={48} />}
        title={data.householdName ?? ''}
        subtitle={`${data.invitedByDisplayName} invited you to join ${data.householdName}`}
      >
        <Badge variant="neutral">member</Badge>
        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={continueWithGoogle}
        >
          Continue with Google
        </Button>
      </PublicPage>
    )
  }

  // A logged-in invitee whose email differs from the invited address can't claim the invite.
  if (data.invitedEmail?.toLowerCase() !== currentPerson.email.toLowerCase()) {
    return <PublicError state="invalid_invitation" />
  }

  // (c) logged-in, NO household → hand off to the root PendingInvitationDialog (it reads the store).
  if (household == null) return <Navigate to="/" replace />

  // (d) logged-in, WITH a household → the conflict dialog (no Accept; D-CONFLICT-ENTRY).
  return <HouseholdConflictDialog targetHouseholdName={data.householdName!} token={token!} />
}
