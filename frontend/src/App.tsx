import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { DesignSystem } from './pages/DesignSystem'
import { Login } from './pages/Login'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Spinner } from './components/ui/Spinner'
import { JoinHousehold } from './pages/JoinHousehold'
import { NotFound } from './pages/NotFound'

// --- Placeholder Pages ---
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { Capital } from './pages/Capital'
import { Assets } from './pages/Assets'
import { Insurance } from './pages/Insurance'
import { Transactions } from './pages/Transactions'
import { RecurringPayments } from './pages/RecurringPayments'
import { Transfers } from './pages/Transfers'
import { Budgets } from './pages/Budgets'
import { Categories } from './pages/Categories'
import { Settings } from './pages/Settings'

// --- App ---

function App() {
  const { currentPerson, isLoading, authError } = useAuth()
  const location = useLocation()

  // While auth is initializing, show a minimal loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <Spinner />
      </div>
    )
  }

  // Not authenticated (or auth failed for a non-auth reason) — show public routes.
  // authError=true means the server returned a non-401 error (500, network failure);
  // in that case we show an error banner on the login page rather than silently
  // redirecting — users are not logged out, they just can't reach authenticated routes.
  if (!currentPerson) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={
            authError ? (
              <div className="flex items-center justify-center min-h-screen bg-bg">
                <div className="w-full max-w-md mx-4 text-center space-y-4">
                  <p className="text-text-secondary text-sm">
                    Unable to connect to the server. Please refresh the page to try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="text-primary text-sm hover:underline"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ) : <Login />
          } />
          <Route path="/design-system" element={<DesignSystem />} />
          <Route path="/join/:token" element={<JoinHousehold />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    )
  }

  // Authenticated — if on /login, redirect based on default_view (AC 3)
  // Both 'household' and 'personal' resolve to /dashboard for now; branch exists for future routing split
  if (location.pathname === '/login') {
    const destination = currentPerson.defaultView === 'personal' ? '/dashboard' : '/dashboard';
    return <Navigate to={destination} replace />
  }

  // Authenticated — design-system always standalone; all other routes inside AppShell
  return (
    <ErrorBoundary>
      <Routes>
        {/* Design system — always rendered without AppShell regardless of auth state */}
        <Route path="/design-system" element={<DesignSystem />} />

        {/* Join household — rendered without AppShell */}
        <Route path="/join/:token" element={<JoinHousehold />} />

        {/* All other routes inside AppShell */}
        <Route path="/*" element={
          <AppShell>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/capital" element={<Capital />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/insurance" element={<Insurance />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/recurring-payments" element={<RecurringPayments />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppShell>
        } />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
