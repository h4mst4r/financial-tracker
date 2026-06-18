import { Button, Badge } from '../components/primitives'
import { PublicPage } from '../components/PublicPage'
import { BrandMark } from '../components/BrandMark'
import { branding } from '../config/branding'

/** Start the Google OAuth flow — a real navigation to the backend (ARCH §1.2), not a fetch. */
function continueWithGoogle() {
  window.location.href = '/auth/login'
}

/** Dev bypass (§2.5): POST /auth/dev-login sets the session cookie + echoes the id in `X-Session-Id`;
 *  the SPA persists it as the `X-Session-Token` fallback, then reloads so useAuth refetches /auth/me. */
async function devLogin() {
  const res = await fetch('/auth/dev-login', { method: 'POST', credentials: 'include' })
  const token = res.headers.get('X-Session-Id')
  if (token) sessionStorage.setItem('dev_session_token', token)
  window.location.assign('/')
}

/** Login page (UX §4.1, bible §4). Entry point — branding wordmark + mark, Continue with Google, and
 *  (only under dev bypass) a Dev login button + DEV BYPASS badge. `oauthError` shows the calm banner. */
export function Login({ oauthError = false }: { oauthError?: boolean }) {
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
      {import.meta.env.DEV && (
        <div className="mt-sm flex flex-col items-center gap-sm">
          <Button variant="ghost" onClick={devLogin}>
            Dev login
          </Button>
          <Badge variant="warning">DEV BYPASS ON</Badge>
        </div>
      )}
    </PublicPage>
  )
}
