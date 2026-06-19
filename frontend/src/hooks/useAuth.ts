import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import type { AuthMe } from '../types/auth'

export interface UseAuthResult {
  isLoading: boolean
  /** Bootstrap failure that is NOT a 401 (network / 5xx). A 401 never settles here — api/client.ts
   *  clears auth and hard-redirects to /login (returns a never-settling promise). */
  authError: Error | null
}

/** Bootstrap: fetch `GET /auth/me` once on mount → `authStore.setAuth` (FR-P-001, ARCH §6.1/§6.3).
 *  The fetch flows through TanStack Query (never useState/useEffect for server data). `setAuth` runs
 *  inside `queryFn` — before the query transitions to success — so the store is populated in the
 *  same render that `isLoading` flips false; otherwise the guard would briefly see an authenticated
 *  user as logged-out and bounce to /login. */
export function useAuth(): UseAuthResult {
  const setAuth = useAuthStore((s) => s.setAuth)

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const me = (await api.get<AuthMe>('/auth/me')).data
      setAuth(me)
      // Bootstrap the Epic-1 theming engine from the persisted per-person preferences (Story 2.9).
      // setAppearance defaults reduceMotion/density, so a (logged-out) null person leaves the
      // branding defaults in place; an authed person's saved theme/font applies at first paint.
      if (me.person) {
        useThemeStore
          .getState()
          .setAppearance(
            me.person.theme ?? 'base',
            me.person.font ?? 'base',
            me.person.reduceMotion,
            me.person.density,
          )
      }
      return me
    },
    // Bootstrap once; never refetch on window-focus/reconnect. A background refetch would call
    // `setAuth` again and resurrect `isFirstLogin` (household.created_at is still < 2 min), reopening
    // the New Household modal the user just dismissed/saved (Story 2.4c gotcha #1 — dismissal is local).
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  return { isLoading: query.isPending, authError: query.error }
}
