import { useQuery } from '@tanstack/react-query'
import { Button, Badge } from '../components/primitives'
import { PublicPage } from '../components/PublicPage'
import { BrandMark } from '../components/BrandMark'
import { branding } from '../config/branding'
import { BADGE_VARIANT_FOR_TONE } from '../config/statusRegistry'
import { api } from '../api/client'

/** Start the Google OAuth flow — a real navigation to the backend (ARCH §1.2), not a fetch. */
function continueWithGoogle() {
  window.location.href = '/auth/login'
}

/** Dev bypass (§2.5): POST /auth/dev-login sets the session cookie + echoes the id in `X-Session-Id`;
 *  the SPA persists it as the `X-Session-Token` fallback (the reliable dev path through the Vite proxy),
 *  then navigates so useAuth refetches /auth/me. */
async function devLogin() {
  const res = await fetch('/auth/dev-login', { method: 'POST', credentials: 'include' })
  const token = res.headers.get('X-Session-Id')
  if (token) sessionStorage.setItem('dev_session_token', token)
  window.location.assign('/')
}

/** Login page (UX §4.1, bible §4). Entry point — branding wordmark + mark + Continue with Google;
 *  `oauthError` shows the calm banner. The Dev login button + DEV BYPASS badge render **only** when the
 *  backend reports `AUTH_BYPASS_ENABLED` (GET /auth/config) AND this is a dev build — never in prod, and
 *  never when the flag is off (so the badge can't claim "on" when it isn't). */
export function Login({ oauthError = false }: { oauthError?: boolean }) {
  // Only ask the backend in dev builds; prod never renders the control, so it never fetches.
  const { data: config } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: async () => (await api.get<{ authBypassEnabled: boolean }>('/auth/config')).data,
    enabled: import.meta.env.DEV,
    staleTime: Infinity,
  })
  const showDevLogin = import.meta.env.DEV && config?.authBypassEnabled === true

  return (
    <PublicPage header={<BrandMark size={40} className="mb-sm" />} title={branding.wordmark}>
      {oauthError && (
        <p className="w-full rounded-md bg-error-fill px-md py-sm text-sm text-error">
          Sign-in failed — please try again.
        </p>
      )}
      <Button variant="primary" className="w-full justify-center" onClick={continueWithGoogle}>
        Continue with Google
      </Button>
      {showDevLogin && (
        <div className="mt-sm flex flex-col items-center gap-sm">
          <Button variant="ghost" onClick={devLogin}>
            Dev login
          </Button>
          {/* Static dev-environment indicator — consumes the §4 `warning` tone via the bridge (no
              call-site tone literal; L6). */}
          <Badge variant={BADGE_VARIANT_FOR_TONE.warning}>DEV BYPASS ON</Badge>
        </div>
      )}
    </PublicPage>
  )
}
