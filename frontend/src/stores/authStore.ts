import { create } from 'zustand'
import type { AuthMe, Person, Household, PendingInvitation } from '../types/auth'

interface AuthState {
  currentPerson: Person | null
  household: Household | null
  csrfToken: string | null
  defaultView: 'household' | 'personal'
  pendingInvitation: PendingInvitation | null
  setAuth: (me: AuthMe) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  currentPerson: null,
  household: null,
  csrfToken: null,
  defaultView: 'household',
  pendingInvitation: null,

  setAuth: (me: AuthMe) =>
    set({
      currentPerson: me.person,
      household: me.household,
      csrfToken: me.csrfToken,
      defaultView: me.person?.defaultView ?? 'household',
      pendingInvitation: me.pendingInvitation,
    }),

  clearAuth: () =>
    set({
      currentPerson: null,
      household: null,
      csrfToken: null,
      defaultView: 'household',
      pendingInvitation: null,
    }),
}))
