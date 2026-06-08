import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { DesignSystem } from './pages/DesignSystem'
import { Login } from './pages/Login'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { Spinner } from './components/ui/Spinner'
import { JoinHousehold } from './pages/JoinHousehold'
import { NotFound } from './pages/NotFound'
import { PublicPage } from './components/layout/PublicPage'
import { AlertBanner } from './components/ui/AlertBanner'
import { PendingInvitationDialog } from './components/ui/PendingInvitationDialog'
import { useAuthStore } from './store/authStore'
import { useCallback } from 'react'

function ConnectionError() {
  return (
    <PublicPage title="Unable to Connect" subtitle="The server is not responding">
      <AlertBanner
        variant="error"
        message="Unable to reach the server. Check that the backend is running, then refresh."
      />
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full mt-4 text-sm text-primary hover:underline"
      >
        Refresh
      </button>
    </PublicPage>
  )
}

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
  const pendingInvitation = useAuthStore((s) => s.pendingInvitation)
  const householdId = useAuthStore((s) => s.householdId)
  const householdName = useAuthStore((s) => s.householdName)
  const setPendingInvitation = useAuthStore((s) => s.setPendingInvitation)

  const handleDismissInvitation = useCallback(() => {
    setPendingInvitation(null);
  }, [setPendingInvitation]);

  // /login is always a public page — rendered before any auth gating.
  // This allows the user to reach it even when the dev bypass has auto-authenticated
  // them, so they can click "Sign in with Google" to switch to a real OAuth account.
  if (location.pathname === '/login') {
    return (
      <ErrorBoundary>
        {authError ? <ConnectionError /> : <Login />}
      </ErrorBoundary>
    )
  }

  // While auth is initializing, show a minimal loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <Spinner />
      </div>
    )
  }

  // Not authenticated (or auth failed for a non-auth reason) — show public routes.
  if (!currentPerson) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/design-system" element={<DesignSystem />} />
          <Route path="/join/:token" element={<JoinHousehold />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    )
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

      {/* PendingInvitationDialog — rendered at the app root, outside routes */}
      {pendingInvitation && (
        <PendingInvitationDialog
          isOpen={!!pendingInvitation}
          onClose={handleDismissInvitation}
          invitation={pendingInvitation}
          currentHouseholdId={householdId ?? undefined}
          currentHouseholdName={householdName ?? undefined}
          userRole={currentPerson?.role}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
