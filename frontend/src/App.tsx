import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './components/LoginPage'
import DashboardPage from './components/DashboardPage'
import HouseholdSettingsPage from './components/HouseholdSettingsPage'
import AcceptInvitationPage from './components/AcceptInvitationPage'
import CategoryManager from './components/CategoryManager'
import AccountManager from './components/AccountManager'
import TestPage from './components/TestPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return user ? <>{children}</> : <Navigate to="/login" />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <HouseholdSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invite/:invitationId"
        element={
          <ProtectedRoute>
            <AcceptInvitationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute>
            <CategoryManager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <AccountManager />
          </ProtectedRoute>
        }
      />
      <Route path="/test" element={<TestPage />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
