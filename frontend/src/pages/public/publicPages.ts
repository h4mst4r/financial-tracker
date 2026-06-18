import {
  Mail,
  Lock,
  SearchX,
  Unplug,
  WifiOff,
  TriangleAlert,
  LogOut,
  Wrench,
  House,
  UserMinus,
  Ban,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PublicPageTone } from '../../components/PublicPage'

/** Every public / error page state (UX §3 → ARCH §5.8). `loading` renders the branded Spinner. */
export type PublicPageState =
  | 'loading'
  | 'not_invited'
  | 'access_denied'
  | 'not_found'
  | 'refused_connection'
  | 'lost_connection'
  | 'generic_error'
  | 'logout'
  | 'maintenance'
  | 'household_deleted'
  | 'removed'
  | 'account_archived'
  | 'invalid_invitation'

/** What the page's primary action does. `login` → /login, `home` → /, `reload` → hard refresh. */
export type PublicPageActionKind = 'login' | 'home' | 'reload'

export interface PublicPageConfig {
  icon?: LucideIcon
  tone: PublicPageTone
  title: string
  subtitle?: string
  actionLabel?: string
  actionKind?: PublicPageActionKind
  /** Primary-styled action (Sign in / Sign in with another account). Others use the default Button. */
  actionPrimary?: boolean
}

// Icons / semantic colours / calm copy / actions mirror the design bible §3 frames field-for-field
// (design-bible/index.html lines 486–496). `loading` carries no icon — PublicError renders Spinner.
export const PUBLIC_PAGE_STATES: Record<PublicPageState, PublicPageConfig> = {
  loading: {
    tone: 'accent',
    title: 'Loading',
    subtitle: 'Just a moment.',
  },
  not_invited: {
    icon: Mail,
    tone: 'warning',
    title: 'Not invited',
    subtitle: "This account isn't part of a household yet.",
    actionLabel: 'Sign in with another account',
    actionKind: 'login',
    actionPrimary: true,
  },
  access_denied: {
    icon: Lock,
    tone: 'error',
    title: 'Access denied',
    subtitle: "You don't have permission to view this.",
    actionLabel: 'Back to dashboard',
    actionKind: 'home',
  },
  not_found: {
    icon: SearchX,
    tone: 'neutral',
    title: 'Not found',
    subtitle: "That page doesn't exist.",
    actionLabel: 'Back to dashboard',
    actionKind: 'home',
  },
  refused_connection: {
    icon: Unplug,
    tone: 'error',
    title: 'Refused connection',
    subtitle: "Couldn't reach the server.",
    actionLabel: 'Retry',
    actionKind: 'reload',
  },
  lost_connection: {
    icon: WifiOff,
    tone: 'warning',
    title: 'Lost connection',
    subtitle: 'Your session dropped.',
    actionLabel: 'Reconnect',
    actionKind: 'reload',
  },
  generic_error: {
    icon: TriangleAlert,
    tone: 'error',
    title: 'Generic error',
    subtitle: 'Something went wrong.',
    actionLabel: 'Try again',
    actionKind: 'reload',
  },
  logout: {
    icon: LogOut,
    tone: 'neutral',
    title: 'Logout',
    subtitle: "You've been signed out.",
    actionLabel: 'Sign in',
    actionKind: 'login',
    actionPrimary: true,
  },
  maintenance: {
    icon: Wrench,
    tone: 'info',
    title: 'Maintenance',
    subtitle: 'Back shortly.',
  },
  household_deleted: {
    icon: House,
    tone: 'error',
    title: 'Household deleted',
    subtitle: 'The owner removed this household.',
    actionLabel: 'Sign out',
    actionKind: 'login',
  },
  removed: {
    icon: UserMinus,
    tone: 'warning',
    title: 'Removed from household',
    subtitle: 'You were removed; data preserved for re-invite.',
    actionLabel: 'Sign out',
    actionKind: 'login',
  },
  // Story 2.8 / FR-P-007 — an archived member (membership intact) reaching login via
  // `?error=account_archived`; recoverable by an admin Restore, so warning (not error), like removed.
  account_archived: {
    icon: Ban,
    tone: 'warning',
    title: 'Account suspended',
    subtitle: 'An admin suspended your access; your data is preserved until they restore it.',
    actionLabel: 'Sign out',
    actionKind: 'login',
  },
  invalid_invitation: {
    icon: Ban,
    tone: 'error',
    title: 'Invite expired',
    subtitle: 'This invitation is no longer valid.',
    actionLabel: 'Go to login',
    actionKind: 'login',
    // Secondary, not primary — the bible §4.1a renders "Go to login" as a plain `btn` (primary is
    // reserved for the active sign-in CTAs: Not Invited / Logout). Matches the bible-foundation.
    actionPrimary: false,
  },
}
