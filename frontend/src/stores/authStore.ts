import { create } from 'zustand'
import type { AuthMe, Person, Household, PendingInvitation } from '../types/auth'

interface AuthState {
  currentPerson: Person | null
  household: Household | null
  csrfToken: string | null
  defaultView: 'household' | 'personal'
  pendingInvitation: PendingInvitation | null
  isFirstLogin: boolean
  setAuth: (me: AuthMe) => void
  clearAuth: () => void
  dismissFirstLogin: () => void
  setHousehold: (household: Household) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  currentPerson: null,
  household: null,
  csrfToken: null,
  defaultView: 'household',
  pendingInvitation: null,
  isFirstLogin: false,

  setAuth: (me: AuthMe) =>
    set({
      currentPerson: me.person,
      household: me.household,
      csrfToken: me.csrfToken,
      defaultView: me.person?.defaultView ?? 'household',
      pendingInvitation: me.pendingInvitation,
      isFirstLogin: me.isFirstLogin,
    }),

  clearAuth: () =>
    set({
      currentPerson: null,
      household: null,
      csrfToken: null,
      defaultView: 'household',
      pendingInvitation: null,
      isFirstLogin: false,
    }),

  // Skip / Save dismiss the first-login modal for this session. Done locally (NOT by refetching
  // /auth/me — household.created_at is still < 2 min, so a refetch would re-set isFirstLogin true
  // and reopen the modal, Story 2.4c gotcha #1).
  dismissFirstLogin: () => set({ isFirstLogin: false }),
  setHousehold: (household: Household) => set({ household }),
}))
