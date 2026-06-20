import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useAppearance } from './theme/useAppearance'
import { useAuth } from './hooks/useAuth'
import { useAuthStore } from './stores/authStore'
import { DesignSystem } from './pages/DesignSystem'
import { NeutralShell } from './components/NeutralShell'
import { NewHouseholdModal } from './components/NewHouseholdModal'
import { PendingInvitationDialog } from './components/PendingInvitationDialog'
import { HouseholdConflictDialog } from './components/HouseholdConflictDialog'
import { AppShell } from './components/shell/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { Categories } from './pages/Categories'
import { Currencies } from './pages/Currencies'
import { JoinHousehold } from './pages/JoinHousehold'
import { PublicError } from './pages/public/PublicError'
import { Spinner } from './components/primitives/Spinner'
import { ApiError } from './api/client'
import { branding } from './config/branding'

// Minimal in-shell dashboard placeholder until the real Dashboard lands (Epic 9). It mounts at
// `/dashboard` (the canonical path the Sidebar nav + the "Back to dashboard" error actions target);
// `/` redirects here so the landing page and the nav agree.
function DashboardHome() {
  return (
    <div className="p-lg text-text-primary">
      <h1 className="text-2xl font-medium">{branding.appName}</h1>
    </div>
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
  if (error === 'account_archived') return <PublicError state="account_archived" />
  return <Login oauthError={error === 'oauth_error'} />
}

/** Gated app per the §6.5 precedence: loading → unauthenticated → NULL-household → in-household.
 *  `/login` and (DEV) `/design-system` are matched before this catch-all, so they render ungated. */
function GatedApp({
  isLoading,
  authenticated,
  hasHousehold,
  hasPendingInvitation,
}: {
  isLoading: boolean
  authenticated: boolean
  hasHousehold: boolean
  hasPendingInvitation: boolean
}) {
  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size={32} />
      </main>
    )
  }
  if (!authenticated) return <Navigate to="/login" replace />
  // NULL-household (ARCH §6.5 branch 4): a session reaches here only carrying a pending invite (the
  // accept/decline gate); after Decline clears it, the branch falls to the Not-Invited page.
  if (!hasHousehold) {
    if (!hasPendingInvitation) return <PublicError state="not_invited" />
    return (
      <NeutralShell>
        <PendingInvitationDialog />
      </NeutralShell>
    )
  }
  // In-household app (ARCH §6.5 branch 5): routes render inside the AppShell (Sidebar + Topbar).
  // `/` is the app root (Home until `/dashboard` lands, Epic 9); any other path is an unmatched
  // in-app route → Not Found (ARCH §5.8); real module routes land in Epic 3+. NewHouseholdModal
  // self-gates on `isFirstLogin` (Story 2.4c) and HouseholdConflictDialog on a cross-household
  // `pendingInvitation` (Story 2.6c, ARCH §2.8a conflict-push) — both route-agnostic, mounted
  // alongside the shell so they overlay it. The ToastContainer stays outside AppShell (main.tsx).
  return (
    <>
      <NewHouseholdModal />
      <HouseholdConflictDialog />
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/currencies" element={<Currencies />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<PublicError state="not_found" />} />
        </Routes>
      </AppShell>
    </>
  )
}

export default function App() {
  useAppearance()
  const { isLoading, authError } = useAuth()
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const household = useAuthStore((s) => s.household)
  const pendingInvitation = useAuthStore((s) => s.pendingInvitation)

  // Maintenance is global (ARCH §5.4/§5.8): a 503 on the bootstrap `GET /auth/me` short-circuits the
  // whole app to the Maintenance page on every path — before <Routes>, so it pre-empts LoginRoute's
  // `authError → refused_connection` branch (a 503 is Maintenance, not a refused connection). All
  // hooks run above this point (rules-of-hooks).
  if (authError instanceof ApiError && authError.status === 503) {
    return (
      <ErrorBoundary>
        <PublicError state="maintenance" />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginRoute authError={authError !== null} />} />
        {/* Reachable in every auth state (unauth / NULL-household / in-household), before the gated
            catch-all — the invite link validates the token itself (ARCH §6.5/§6.6). */}
        <Route path="/join/:token" element={<JoinHousehold />} />
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
        <Route
          path="*"
          element={
            <GatedApp
              isLoading={isLoading}
              authenticated={currentPerson !== null}
              hasHousehold={household !== null}
              hasPendingInvitation={pendingInvitation !== null}
            />
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}
