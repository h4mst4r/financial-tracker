import type { LucideIcon } from 'lucide-react'
import { moduleNavIcon, ACTION_ICON } from './iconRegistry'

// Empty/error copy registry (UX §18 + §11; FRONTEND-AUDIT B5). Empty/error copy is a LOOKUP, not
// freestyled per caller. The copy here is lifted verbatim from the build's existing EmptyState call
// sites — this is consolidation, not new copy. The icon defaults to the surface's own module nav glyph
// (§11), with overrides for non-module surfaces.

const navIcon = (route: string): LucideIcon => {
  const icon = moduleNavIcon(route)
  if (!icon) throw new Error(`No module nav glyph for route ${route}`)
  return icon
}

export interface EmptyStateCopy {
  icon: LucideIcon
  title: string
  description: string
}

// Keyed by surface. The four account-subtype routes (UX §1.2 — /accounts /capital /assets /insurance)
// all use the Accounts nav glyph (Wallet) in the build; titles/descriptions are the verbatim output of
// each route's `newLabel` (account · "capital account" · asset · policy). NB: "Add a asset" preserves
// the build's existing article (a pre-existing copy wart, kept for parity; a future copy polish).
export const EMPTY_STATE = {
  accounts: {
    icon: navIcon('/accounts'),
    title: 'No accounts yet',
    description: 'Add an account to start tracking it.',
  },
  capital: {
    icon: navIcon('/accounts'),
    title: 'No capital accounts yet',
    description: 'Add a capital account to start tracking it.',
  },
  assets: {
    icon: navIcon('/accounts'),
    title: 'No assets yet',
    description: 'Add a asset to start tracking it.',
  },
  insurance: {
    icon: navIcon('/accounts'),
    title: 'No policies yet',
    description: 'Add a policy to start tracking it.',
  },
  currencies: {
    icon: navIcon('/currencies'),
    title: 'No currencies yet',
    description: 'Add a currency to transact and view in it.',
  },
  categories: {
    icon: navIcon('/categories'),
    title: 'No categories yet',
    description: 'Start with our defaults or add your own.',
  },
  invitations: {
    icon: ACTION_ICON.revokeInvite,
    title: 'No invitations yet',
    description: 'Invitations you send will appear here.',
  },
  settingsPlaceholder: {
    icon: navIcon('/settings'),
    title: 'Coming soon',
    description: "This section isn't available yet.",
  },
} as const satisfies Record<string, EmptyStateCopy>

export type EmptyStateKey = keyof typeof EMPTY_STATE

// The in-app error data-surface copy (UX §18 — inline + Retry; the glyph is iconRegistry.errorIcon).
export const ERROR_STATE = {
  title: 'Something went wrong',
  description: "We couldn't load this. Please try again.",
} as const
