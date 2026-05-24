import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const errorMessages: Record<string, string> = {
  invalid_state: 'Login attempt expired. Please try again.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  invalid_token: 'Authentication failed. Please try again.',
  no_id_token: 'Authentication failed. Please try again.',
  no_email: 'No email found. Please try again.',
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const { user, login } = useAuth()

  // Redirect if already logged in
  if (user) {
    window.location.href = '/dashboard'
    return null
  }

  const error = searchParams.get('error')
  const errorMessage = error ? errorMessages[error] || 'An unexpected error occurred.' : null

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="bg-surface border border-border rounded-xl p-12 text-center max-w-md w-full">
        <h1 className="text-3xl font-bold text-primary mb-2">
          Financial Tracker
        </h1>
        <p className="text-sm text-text-secondary mb-8">
          Sign in to your account
        </p>

        {errorMessage && (
          <div className="bg-error/20 border border-error text-error p-4 rounded-lg mb-6 text-sm">
            {errorMessage}
          </div>
        )}

        <button
          onClick={login}
          className="inline-flex items-center justify-center gap-3 bg-primary hover:bg-primary-hover text-background border-none rounded-lg px-8 py-3 text-base font-medium cursor-pointer min-h-[44px] w-full transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v3.53h3.53c2.06-1.9 3.28-4.72 3.28-7.86z"/>
            <path fill="currentColor" d="M12 23c2.8 0 5.14-.94 6.86-2.55l-3.53-3.53c-1.1.74-2.5 1.18-3.33 1.18-2.54 0-4.7-1.72-5.47-4.03H3.03v3.7C4.53 20.7 8.1 23 12 23z"/>
            <path fill="currentColor" d="M6.53 14.05a5.63 5.63 0 0 1 0-3.6V6.75H3.03a11.14 11.14 0 0 0 0 9.9l3.5-2.6z"/>
            <path fill="currentColor" d="M12 5.38c1.52 0 2.8.52 3.84 1.53l2.86-2.86C16.86 2.6 14.38 1.5 12 1.5 8.1 1.5 4.53 3.7 3.03 6.75l3.5 2.6c.77-2.3 2.93-4.03 5.47-4.03z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="mt-8 text-xs text-text-muted">
          &copy; 2026 Financial Tracker
        </p>
      </div>
    </div>
  )
}
