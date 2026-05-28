import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppShell } from './components/layout/AppShell'
import { DesignSystem } from './pages/DesignSystem'

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

/**
 * AuthGuard — checks authStore.currentPerson and redirects to /login if absent.
 * Used as a wrapper for all protected routes within AppShell.
 */
interface AuthGuardProps {
  children: React.ReactNode
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const currentPerson = useAuthStore((state) => state.currentPerson)
  const location = useLocation()

  if (!currentPerson) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  return <>{children}</>
}

// --- App ---

function App() {
  const currentPerson = useAuthStore((state) => state.currentPerson)

  // If not authenticated, only allow /login and /design-system
  if (!currentPerson) {
    return (
      <Routes>
        <Route path="/login" element={<div className="flex items-center justify-center h-screen bg-bg text-text-primary">Login (placeholder)</div>} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated — all routes within AppShell
  return (
    <AppShell>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Design system — always accessible in dev */}
        <Route path="/design-system" element={<DesignSystem />} />

        {/* Module routes */}
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

        {/* 404 catch-all */}
        <Route path="*" element={<div className="flex items-center justify-center h-full text-text-secondary">404 — Not Found</div>} />
      </Routes>
    </AppShell>
  )
}

export default App
