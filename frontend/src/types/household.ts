/** Settings → Management rosters (Story 2.5). camelCase mirrors the §2.14.C person /
 *  pendingInvitation shapes (D-CASE-LISTS). */

/** A household member row (GET /api/household/members). `status` is synthetic ("active") until
 *  Story 2.8 adds the member archive lifecycle. */
export interface Member {
  personId: string
  displayName: string | null
  email: string
  role: 'owner' | 'admin' | 'member'
  pictureUrl: string | null
  colour: string | null
  status: string
}

/** A household invitation row (GET /api/household/invitations). No `id`/token — that is the
 *  `/join/:token` token, surfaced only behind Story 2.6's admin/owner-gated invite actions. */
export interface Invitation {
  invitedEmail: string
  status: string
  expiresAt: string
  createdAt: string
}

/** An admin/owner invitation row (GET /api/household/invitations/manage). Unlike `Invitation`, it
 *  carries `invitationId` — the `/join/:token` token — surfaced only behind the role-gated invite
 *  actions (Story 2.6b). `status` may be the server-derived `"expired"`. */
export interface InvitationManage {
  invitationId: string
  invitedEmail: string
  status: string
  expiresAt: string
  createdAt: string
}

/** Public token-validation result (GET /api/invitations/:token, always 200). The context fields are
 *  populated only when `status === 'pending'` (Story 2.6b). */
export interface InvitationValidation {
  status: 'pending' | 'invalid'
  householdName?: string
  invitedByDisplayName?: string
  invitedEmail?: string
  expiresAt?: string
}

/** The standard list-endpoint envelope (backend.md §2: never a bare array). */
export interface ListResponse<T> {
  items: T[]
  total: number
}
