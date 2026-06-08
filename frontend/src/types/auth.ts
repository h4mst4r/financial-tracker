/**
 * Auth-related types shared between API, store, and components.
 */

/** Pending invitation details returned by /auth/me */
export interface PendingInvitation {
  token: string;
  householdId: string;
  householdName: string;
  invitedByDisplayName: string;
  invitedEmail: string;
  expiresAt: string;
  status: string;
}
