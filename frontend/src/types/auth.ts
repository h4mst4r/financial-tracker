/** Person shape from /auth/me (§2.14.C) */
export interface Person {
  personId: string
  displayName: string
  email: string
  role: 'owner' | 'admin' | 'member'
  pictureUrl: string | null
  defaultView: 'household' | 'personal'
  displayCurrency: string
  canCreateHousehold: boolean
}

/** Household shape from /auth/me (§2.14.C) */
export interface Household {
  householdId: string
  name: string
  baseCurrency: string
  timezone: string
}

/** Pending invitation shape from /auth/me (§2.14.C) */
export interface PendingInvitation {
  token: string
  householdId: string
  householdName: string
  invitedByDisplayName: string
  invitedEmail: string
  expiresAt: string
  status: string
}

/** Full /auth/me response payload (§2.14.C) */
export interface AuthMe {
  person: Person | null
  household: Household | null
  csrfToken: string
  pendingInvitation: PendingInvitation | null
  isFirstLogin: boolean
}
