import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useAppearance } from './theme/useAppearance'
import { useAuth } from './hooks/useAuth'
import { useAuthStore } from './stores/authStore'
import { DesignSystem } from './pages/DesignSystem'
import { NeutralShell } from './components/NeutralShell'
import { NewHouseholdModal } from './components/NewHouseholdModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Login } from './pages/Login'
import { PublicError } from './pages/public/PublicError'
import { Spinner } from './components/primitives/Spinner'

function Placeholder() {
  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <h1>Financial Tracker</h1>
    </main>
  )
}

/** `/login` surface (ARCH §5.8). Backend-unreachable (the bootstrap `authError`) wins → Refused
 *  Connection; otherwise the OAuth `?error=` code maps to its page (detachment codes → §3 pages,
 *  `oauth_error` → Login + banner), and the bare route renders the Login page (UX §4.1). */
function LoginRoute({ authError }: { authError: boolean }) {
  const [params] = useSearchParams()
  if (authError) return <PublicError state="refused_connection" />
  const error = params.get('error')
  if (error === 'not_invited') return <PublicError state="not_invited" />
  if (error === 'removed') return <PublicError state="removed" />
  if (error === 'household_deleted') return <PublicError state="household_deleted" />
  return <Login oauthError={error === 'oauth_error'} />
}

/** Gated app per the §6.5 precedence: loading → unauthenticated → NULL-household → in-household.
 *  `/login` and (DEV) `/design-system` are matched before this catch-all, so they render ungated. */
function GatedApp({
  isLoading,
  authenticated,
  hasHousehold,
}: {
  isLoading: boolean
  authenticated: boolean
  hasHousehold: boolean
}) {
  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size={32} />
      </main>
    )
  }
  if (!authenticated) return <Navigate to="/login" replace />
  if (!hasHousehold) return <NeutralShell />
  // In-household app: `/` is the app root (the Placeholder until the AppShell story, 2.4d); any other
  // path is an unmatched in-app route → Not Found (ARCH §5.8). Real module routes land in Epic 3+.
  // NewHouseholdModal self-gates on `isFirstLogin` (Story 2.4c) — route-agnostic, so it survives the
  // AppShell swap (2.4d).
  return (
    <>
      <NewHouseholdModal />
      <Routes>
        <Route path="/" element={<Placeholder />} />
        <Route path="*" element={<PublicError state="not_found" />} />
      </Routes>
    </>
  )
}

export default function App() {
  useAppearance()
  const { isLoading, authError } = useAuth()
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const household = useAuthStore((s) => s.household)

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginRoute authError={authError !== null} />} />
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
        <Route
          path="*"
          element={
            <GatedApp
              isLoading={isLoading}
              authenticated={currentPerson !== null}
              hasHousehold={household !== null}
            />
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}
