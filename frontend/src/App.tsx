import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppearance } from './theme/useAppearance'
import { useAuth } from './hooks/useAuth'
import { useAuthStore } from './stores/authStore'
import { DesignSystem } from './pages/DesignSystem'
import { NeutralShell } from './components/NeutralShell'
import { Spinner } from './components/primitives/Spinner'

function Placeholder() {
  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <h1>Financial Tracker</h1>
    </main>
  )
}

/** Minimal `/login` placeholder — the real Login page lands in Story 2.4b. Shows a connection hint
 *  when the bootstrap `/auth/me` failed (the ConnectionError page is also 2.4b). */
function LoginPlaceholder({ authError }: { authError: boolean }) {
  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <h1>{authError ? 'Connection error' : 'Sign in'}</h1>
    </main>
  )
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
  return <Placeholder />
}

export default function App() {
  useAppearance()
  const { isLoading, authError } = useAuth()
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const household = useAuthStore((s) => s.household)

  return (
    <Routes>
      <Route path="/login" element={<LoginPlaceholder authError={authError !== null} />} />
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
  )
}
