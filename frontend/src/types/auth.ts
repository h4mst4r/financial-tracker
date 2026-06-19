import type { ThemeId, FontId, DensityId } from '../theme/palettes'

/** Per-person alert-delivery preferences (`Person.notification_prefs`, UX §5.1, Story 2.9). The six
 *  alert types are always present (the backend default-completes the set). */
export interface NotificationPrefs {
  budgetWarnings: boolean
  budgetOverruns: boolean
  missedRecurring: boolean
  upcomingPayments: boolean
  fxStale: boolean
  backups: boolean
}

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
  // Appearance preferences (Story 2.9) — bootstrapped into the Epic-1 theming engine on load.
  theme: ThemeId
  font: FontId
  density: DensityId
  reduceMotion: boolean
  notificationPrefs: NotificationPrefs
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
