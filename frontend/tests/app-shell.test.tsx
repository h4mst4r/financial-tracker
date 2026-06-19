import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppShell } from '../src/components/shell/AppShell'
import { useAuthStore } from '../src/stores/authStore'
import { branding } from '../src/config/branding'
import type { AuthMe } from '../src/types/auth'

// Drive the responsive mode: useMediaQuery reads window.matchMedia(query).matches. `(max-width:767px)`
// → isMobile, `(max-width:1023px)` → isRail. Default (no override) = all false = expanded desktop.
function setMatch(matches: (q: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: matches(q),
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const ME: AuthMe = {
  person: {
    personId: 'p1',
    displayName: 'Pat Lee',
    email: 'pat@example.com',
    role: 'owner',
    pictureUrl: null,
    defaultView: 'household',
    displayCurrency: 'SGD',
    canCreateHousehold: true,
    theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false,
    notificationPrefs: { budgetWarnings: true, budgetOverruns: true, missedRecurring: true, upcomingPayments: false, fxStale: true, backups: false },
  },
  household: { householdId: 'h1', name: 'HH', baseCurrency: 'SGD', timezone: 'Asia/Singapore' },
  csrfToken: 'csrf-1',
  pendingInvitation: null,
  isFirstLogin: false,
}

const NAV_LABELS = [
  'Dashboard',
  'Accounts',
  'Capital',
  'Assets',
  'Insurance',
  'Transactions',
  'Recurring',
  'Transfers',
  'Budgets',
  'Debt',
  'Categories',
  'Currencies',
  'Formula',
  'Settings',
]

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell>
          <div>routed content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.getState().setAuth(ME)
  setMatch(() => false) // default: expanded desktop
})

afterEach(() => {
  useAuthStore.getState().clearAuth()
  setMatch(() => false)
})

test('renders the branding wordmark from config (FR-SYS-011, not a literal)', () => {
  renderShell()
  expect(screen.getByText(branding.wordmark)).toBeInTheDocument()
})

test('renders all 13 module nav items + the bottom Settings link', () => {
  renderShell()
  for (const label of NAV_LABELS) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
})

test('sidebar has no identity row — identity lives in the topbar avatar (P0/UX §1.1)', () => {
  renderShell()
  const sidebar = screen.getByTestId('sidebar')
  expect(within(sidebar).queryByText('pat@example.com')).not.toBeInTheDocument()
  expect(within(sidebar).queryByText('Pat Lee')).not.toBeInTheDocument()
})

test('topbar avatar menu opens to Profile + Sign out (the sole user menu)', () => {
  renderShell()
  const topbar = screen.getByTestId('topbar')
  fireEvent.click(within(topbar).getByRole('img', { name: 'Pat Lee' }))
  expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
})

test('icon-rail mode (< lg): rail width, labels hidden, every item gets a hover tooltip', () => {
  setMatch((q) => q === '(max-width: 1023px)') // isRail true, isMobile false
  renderShell()
  const sidebar = screen.getByTestId('sidebar')
  expect(sidebar.className).toContain('w-sidebar-rail')
  // Labels move into tooltips — one per nav item + Settings (14).
  expect(sidebar.querySelectorAll('[role="tooltip"]').length).toBe(NAV_LABELS.length)
})

test('mobile mode (< md): Menu bar raises a sheet with the full nav; Esc closes it', () => {
  setMatch(() => true) // isMobile true
  renderShell()
  expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('mobile-menu-bar'))
  const sheet = screen.getByRole('dialog', { name: 'Navigation' })
  expect(within(sheet).getAllByRole('link')).toHaveLength(NAV_LABELS.length)

  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
})
