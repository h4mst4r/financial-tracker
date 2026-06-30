import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { useAuthStore } from '../src/stores/authStore'
import type { Person } from '../src/types/auth'
import type { ListResponse, Member } from '../src/types/household'
import { HH, PREFS, makeResponse, renderManagementTab as renderTab } from './fixtures/household'

const base: Person = {
  personId: 'p0', displayName: 'X', email: 'x@example.com', role: 'admin',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false,
  notificationPrefs: PREFS,
}
const OWNER: Person = { ...base, personId: 'pO', displayName: 'Owner', email: 'owner@example.com', role: 'owner' }
const ADMIN: Person = { ...base, personId: 'pA', displayName: 'Admin', email: 'admin@example.com', role: 'admin' }
const PLAIN: Person = { ...base, personId: 'pM', displayName: 'Mem', email: 'mem@example.com', role: 'member' }

const MEMBERS: ListResponse<Member> = {
  items: [
    { personId: 'pO', displayName: 'Owner', email: 'owner@example.com', role: 'owner', pictureUrl: null, colour: null, status: 'active', canDelete: false },
    { personId: 'pA', displayName: 'Admin', email: 'admin@example.com', role: 'admin', pictureUrl: null, colour: null, status: 'active', canDelete: false },
    { personId: 'pM', displayName: 'Mem', email: 'mem@example.com', role: 'member', pictureUrl: null, colour: null, status: 'active', canDelete: false },
  ],
  total: 3,
}

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    if (u.startsWith('/api/household/members/') && u.endsWith('/remove') && method === 'POST') {
      return makeResponse(null, 204)
    }
    if (u === '/api/household/members') return makeResponse(MEMBERS)
    if (u === '/api/household/invitations/manage') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations') return makeResponse({ items: [], total: 0 })
    if (u === '/api/fx-providers/types') return makeResponse([])
    if (u === '/api/fx-providers') return makeResponse({ items: [], total: 0 })
    throw new Error(`unexpected fetch ${u}`)
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ currentPerson: ADMIN, household: HH, csrfToken: 'csrf' })
  fetchMock = routeFetch()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('Members ⋮ Remove — visibility matrix (Path C)', () => {
  test('admin viewer: ⋮ on other-member row only; none on owner row or own row', async () => {
    renderTab()
    await screen.findByText('Mem')
    // Removable: the plain member (not owner, not self).
    expect(screen.getByLabelText('Actions for Mem')).toBeTruthy()
    // Not removable: the owner, and the admin's own row.
    expect(screen.queryByLabelText('Actions for Owner')).toBeNull()
    expect(screen.queryByLabelText('Actions for Admin')).toBeNull()
  })

  test('owner viewer: ⋮ on admin + member rows; none on own (owner) row', async () => {
    useAuthStore.setState({ currentPerson: OWNER })
    renderTab()
    await screen.findByText('Mem')
    expect(screen.getByLabelText('Actions for Admin')).toBeTruthy()
    expect(screen.getByLabelText('Actions for Mem')).toBeTruthy()
    expect(screen.queryByLabelText('Actions for Owner')).toBeNull()
  })

  test('plain member viewer: no ⋮ on any row', async () => {
    useAuthStore.setState({ currentPerson: PLAIN })
    renderTab()
    await screen.findByText('Owner')
    expect(screen.queryByLabelText(/^Actions for/)).toBeNull()
  })
})

describe('Members ⋮ Remove — action', () => {
  test('Remove → confirm → POST remove fires', async () => {
    renderTab()
    await screen.findByText('Mem')

    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    // Confirmation dialog → confirm.
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, o]) => String(u) === '/api/household/members/pM/remove' && o?.method === 'POST',
        ),
      ).toBe(true),
    )
  })
})
