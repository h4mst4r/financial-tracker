import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ManagementTab } from '../src/components/settings/ManagementTab'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { ListResponse, Member } from '../src/types/household'

// Story 2.8 — the adaptive Members ⋮ (Promote/Demote · Archive/Restore · Remove · Delete-if-empty).

const HH: Household = {
  householdId: 'h1',
  name: "Ben's Household",
  baseCurrency: 'SGD',
  timezone: 'Asia/Singapore',
}
const base: Person = {
  personId: 'p0', displayName: 'X', email: 'x@example.com', role: 'admin',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
  theme: 'base', font: 'base', density: 'comfortable', reduceMotion: false,
  notificationPrefs: { budgetWarnings: true, budgetOverruns: true, missedRecurring: true, upcomingPayments: false, fxStale: true, backups: false },
}
const OWNER: Person = { ...base, personId: 'pO', displayName: 'Owner', email: 'owner@example.com', role: 'owner' }
const ADMIN: Person = { ...base, personId: 'pA', displayName: 'Admin', email: 'admin@example.com', role: 'admin' }
const PLAIN: Person = { ...base, personId: 'pM', displayName: 'Mem', email: 'mem@example.com', role: 'member' }

function member(over: Partial<Member> & Pick<Member, 'personId' | 'displayName' | 'role'>): Member {
  return {
    email: `${over.personId}@example.com`,
    pictureUrl: null,
    colour: null,
    status: 'active',
    canDelete: false,
    ...over,
  }
}

// Owner (never deletable), Admin (active, has data → canDelete false), Mem (active, empty → canDelete
// true), Arch (archived member → Restore).
const MEMBERS: ListResponse<Member> = {
  items: [
    member({ personId: 'pO', displayName: 'Owner', role: 'owner' }),
    member({ personId: 'pA', displayName: 'Admin', role: 'admin', canDelete: false }),
    member({ personId: 'pM', displayName: 'Mem', role: 'member', canDelete: true }),
    member({ personId: 'pZ', displayName: 'Arch', role: 'member', status: 'archived', canDelete: true }),
  ],
  total: 4,
}

function makeResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    if (/\/api\/household\/members\/[^/]+\/role$/.test(u) && method === 'PATCH') return makeResponse(MEMBERS.items[2])
    if (/\/api\/household\/members\/[^/]+\/archive$/.test(u) && method === 'POST') return makeResponse(MEMBERS.items[2])
    if (/\/api\/household\/members\/[^/]+\/restore$/.test(u) && method === 'POST') return makeResponse(MEMBERS.items[2])
    if (/\/api\/household\/members\/[^/]+\/remove$/.test(u) && method === 'POST') return makeResponse(null, 204)
    if (/\/api\/household\/members\/[^/]+$/.test(u) && method === 'DELETE') return makeResponse(null, 204)
    if (u === '/api/household/members') return makeResponse(MEMBERS)
    if (u === '/api/household/invitations/manage') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations') return makeResponse({ items: [], total: 0 })
    throw new Error(`unexpected fetch ${u}`)
  })
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<ManagementTab />, { wrapper })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ currentPerson: OWNER, household: HH, csrfToken: 'csrf' })
  fetchMock = routeFetch()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

function calledWith(method: string, urlMatch: (u: string) => boolean): boolean {
  return fetchMock.mock.calls.some(([u, o]) => urlMatch(String(u)) && (o?.method ?? 'GET') === method)
}

describe('Promote / Demote (owner viewer only)', () => {
  test('owner: member row → Promote, admin row → Demote; clicking Promote PATCHes the role', async () => {
    renderTab()
    await screen.findByText('Mem')

    fireEvent.click(screen.getByLabelText('Actions for Admin'))
    expect(await screen.findByRole('menuitem', { name: 'Demote to member' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Promote to admin' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, o]) =>
            String(u) === '/api/household/members/pM/role' &&
            o?.method === 'PATCH' &&
            String(o?.body).includes('"role":"admin"'),
        ),
      ).toBe(true),
    )
  })

  test('admin viewer: no role item on a member row', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    await screen.findByText('Mem')
    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    await screen.findByRole('menuitem', { name: 'Archive' })
    expect(screen.queryByRole('menuitem', { name: 'Promote to admin' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Demote/ })).toBeNull()
  })
})

describe('Archive / Restore (admin/owner)', () => {
  test('active member → Archive → confirm → POST archive', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    await screen.findByText('Mem')

    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))

    await waitFor(() =>
      expect(calledWith('POST', (u) => u === '/api/household/members/pM/archive')).toBe(true),
    )
  })

  test('archived member → Restore (no Archive) → POST restore', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    await screen.findByText('Arch')

    fireEvent.click(screen.getByLabelText('Actions for Arch'))
    expect(await screen.findByRole('menuitem', { name: 'Restore' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(calledWith('POST', (u) => u === '/api/household/members/pZ/restore')).toBe(true),
    )
  })
})

describe('Delete-if-empty (owner viewer)', () => {
  test('enabled when canDelete → confirm → DELETE; disabled when canDelete is false', async () => {
    renderTab()
    await screen.findByText('Mem')

    // pM is empty (canDelete true) → Delete is enabled and fires.
    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    const enabledDelete = await screen.findByRole('menuitem', { name: 'Delete' })
    expect(enabledDelete).not.toBeDisabled()
    fireEvent.click(enabledDelete)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(calledWith('DELETE', (u) => u === '/api/household/members/pM')).toBe(true),
    )

    // pA has data (canDelete false) → Delete is disabled.
    fireEvent.click(screen.getByLabelText('Actions for Admin'))
    expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeDisabled()
  })

  test('admin viewer: no Delete item anywhere', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    await screen.findByText('Mem')
    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    await screen.findByRole('menuitem', { name: 'Archive' })
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
  })
})

describe('visibility — owner row, self row, plain member', () => {
  test('owner row never shows a ⋮; plain member viewer sees no ⋮', async () => {
    renderTab()
    await screen.findByText('Mem')
    expect(screen.queryByLabelText('Actions for Owner')).toBeNull()

    useAuthStore.setState({ currentPerson: PLAIN })
    renderTab()
    await screen.findAllByText('Owner')
    expect(screen.queryByLabelText(/^Actions for/)).toBeNull()
  })

  test('archived row renders the Archived badge (not active)', async () => {
    renderTab()
    await screen.findByText('Arch')
    // The archived member's row shows an "archived" badge; active members show "active".
    expect(screen.getByText('archived')).toBeTruthy()
  })
})
