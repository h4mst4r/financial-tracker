import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NewHouseholdModal } from '../src/components/NewHouseholdModal'
import { useAuthStore } from '../src/stores/authStore'
import type { Household } from '../src/types/auth'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }

function makeResponse(body: unknown, status = 200) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<NewHouseholdModal />, { wrapper })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('NewHouseholdModal', () => {
  test('does not render when isFirstLogin is false', () => {
    useAuthStore.setState({ household: HH, isFirstLogin: false })
    renderModal()
    expect(screen.queryByText('Set up your household')).toBeNull()
  })

  test('auto-shows with name + timezone fields when isFirstLogin is true', () => {
    useAuthStore.setState({ household: HH, isFirstLogin: true })
    renderModal()
    expect(screen.getByText('Set up your household')).toBeTruthy()
    expect(screen.getByLabelText('Household name')).toBeTruthy()
    expect(screen.getByLabelText('Timezone')).toBeTruthy()
    // P0: no base-currency / date-format controls
    expect(screen.queryByText(/base currency/i)).toBeNull()
    expect(screen.queryByText(/date format/i)).toBeNull()
  })

  test('Skip persists the dismissal via complete-setup, then closes', async () => {
    fetchMock.mockResolvedValue(makeResponse(HH))
    useAuthStore.setState({ household: HH, isFirstLogin: true })
    renderModal()

    fireEvent.click(screen.getByText('Skip'))

    // Skip must hit the server (not just clear local state) so a reload does not re-open the modal.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, opts] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('/api/household/complete-setup')
    expect(opts.method).toBe('POST')
    await waitFor(() => expect(useAuthStore.getState().isFirstLogin).toBe(false))
  })

  test('Save PATCHes /api/household then completes setup, updates store, and closes', async () => {
    const updated: Household = { ...HH, name: 'The Lim Household', timezone: 'Pacific/Auckland' }
    // Fresh Response per call — a Response body is single-use, and Save makes two calls.
    fetchMock.mockImplementation(() => Promise.resolve(makeResponse(updated)))
    useAuthStore.setState({ household: HH, isFirstLogin: true })
    renderModal()

    fireEvent.change(screen.getByLabelText('Household name'), {
      target: { value: 'The Lim Household' },
    })
    fireEvent.click(screen.getByText('Save'))

    // Two calls: the name/timezone PATCH, then the complete-setup stamp.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [patchUrl, patchOpts] = fetchMock.mock.calls[0]!
    expect(String(patchUrl)).toBe('/api/household')
    expect(patchOpts.method).toBe('PATCH')
    expect(JSON.parse(patchOpts.body as string)).toEqual({
      name: 'The Lim Household',
      timezone: 'Asia/Singapore',
    })
    const [completeUrl, completeOpts] = fetchMock.mock.calls[1]!
    expect(String(completeUrl)).toBe('/api/household/complete-setup')
    expect(completeOpts.method).toBe('POST')

    await waitFor(() => expect(useAuthStore.getState().isFirstLogin).toBe(false))
    expect(useAuthStore.getState().household?.name).toBe('The Lim Household')
  })

  test('timezone is a searchable Dropdown — filter then select PATCHes the chosen IANA zone (story 1.13)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(makeResponse({ ...HH, timezone: 'Pacific/Auckland' })))
    useAuthStore.setState({ household: HH, isFirstLogin: true })
    renderModal()

    fireEvent.click(screen.getByLabelText('Timezone')) // open the searchable panel
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'auckland' } })
    fireEvent.click(screen.getByRole('option', { name: /Auckland/ }))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, opts] = fetchMock.mock.calls[0]!
    expect(JSON.parse(opts.body as string).timezone).toBe('Pacific/Auckland')
  })
})
