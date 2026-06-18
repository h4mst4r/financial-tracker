import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'

/** Leave (Path B) and Delete-household (Path A) both end the caller's OWN session server-side, so the
 *  client follows the exact `useLogout` success recipe (ARCH §2.14.E): clear auth → clear the query
 *  cache → SPA-navigate to /login. This is the 204 success path, distinct from the api-client 401
 *  hard-reload. On re-login a deleted-household owner re-seeds a fresh household (§2.6); a leaver with
 *  no invite lands on Not Invited. (Path-C Remove does NOT use this — it never touches the caller's
 *  session; that mutation just invalidates the members list. ARCH §2.8a.) */
function useExitMutation(mutationFn: () => Promise<unknown>) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      useAuthStore.getState().clearAuth()
      queryClient.clear()
      navigate('/login')
    },
  })
}

/** Path B — `POST /api/household/leave` (admin/member). */
export function useLeaveHousehold() {
  return useExitMutation(() => api.post('/api/household/leave'))
}

/** Path A — `DELETE /api/household` (owner). */
export function useDeleteHousehold() {
  return useExitMutation(() => api.delete('/api/household'))
}
