import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

/** Sign out (ARCH §2.14.E): POST /auth/logout (204) → clear auth → clear the query cache →
 *  SPA-navigate to /login. Server state goes through TanStack Query (CLAUDE.md §8.2). The api client
 *  attaches the CSRF header for this non-safe method automatically. This is the success (204) path —
 *  distinct from the api-client 401 hard-reload, which logout never triggers. Clearing the query
 *  cache prevents prior-user data flashing if a different user signs in on the same tab (no reload). */
export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      useAuthStore.getState().clearAuth()
      queryClient.clear()
      navigate('/login')
    },
  })

  return { logout: () => mutation.mutate(), isPending: mutation.isPending }
}
