import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { useAuthStore } from '../src/stores/authStore'
import type { Person } from '../src/types/auth'
import type { ListResponse, Member } from '../src/types/household'
import { HH, PREFS, makeResponse, renderManagementTab as renderTab } from './fixtures/household'

const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false,
  notificationPrefs: PREFS,
}
const ADMIN: Person = { ...OWNER, personId: 'p2', displayName: 'Al', email: 'al@example.com', role: 'admin', canCreateHousehold: false }
const MEMBER: Person = { ...ADMIN, personId: 'p3', displayName: 'Mo', email: 'mo@example.com', role: 'member' }

const MEMBERS: ListResponse<Member> = {
  items: [{ personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner', pictureUrl: null, colour: null, status: 'active', canDelete: false }],
  total: 1,
}

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    if (u === '/api/household' && method === 'DELETE') return makeResponse(null, 204)
    if (u === '/api/household/leave' && method === 'POST') return makeResponse(null, 204)
    if (u === '/api/household/members') return makeResponse(MEMBERS)
    if (u === '/api/household/invitations/manage') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations') return makeResponse({ items: [], total: 0 })
    throw new Error(`unexpected fetch ${u}`)
  })
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

describe('Danger Zone — role-conditional control', () => {
  test('owner sees Delete household, not Leave', () => {
    renderTab()
    expect(screen.getByRole('button', { name: 'Delete household' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Leave household' })).toBeNull()
  })

  test('admin sees Leave household, not Delete', () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete household' })).toBeNull()
  })

  test('plain member sees Leave household, not Delete', () => {
    useAuthStore.setState({ currentPerson: MEMBER })
    renderTab()
    expect(screen.getByRole('button', { name: 'Leave household' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete household' })).toBeNull()
  })
})

describe('Delete household — type-the-name confirm (Path A)', () => {
  test('Delete button is disabled until the typed name matches, then deletes + clears auth', async () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Delete household' }))

    const dialog = screen.getByRole('dialog')
    const confirmBtn = within(dialog).getByRole('button', { name: 'Delete household' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const input = within(dialog).getByLabelText('Type the household name to confirm') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'wrong' } })
    expect(confirmBtn.disabled).toBe(true)

    fireEvent.change(input, { target: { value: "Ben's Household" } })
    expect(confirmBtn.disabled).toBe(false)

    fireEvent.click(confirmBtn)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/household' && o?.method === 'DELETE')).toBe(true),
    )
    // The success recipe ran: auth cleared (→ /login).
    await waitFor(() => expect(useAuthStore.getState().currentPerson).toBeNull())
  })
})

describe('Leave household (Path B)', () => {
  test('confirming Leave POSTs leave and clears auth', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/household/leave' && o?.method === 'POST')).toBe(true),
    )
    await waitFor(() => expect(useAuthStore.getState().currentPerson).toBeNull())
  })
})
