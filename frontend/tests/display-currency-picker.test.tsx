import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { DisplayCurrencyPicker } from '../src/components/shell/DisplayCurrencyPicker'
import { useAuthStore } from '../src/stores/authStore'
import { api } from '../src/api/client'
import type { Currency } from '../src/types/currency'
import type { Person } from '../src/types/auth'

// SGD + USD are display-active; EUR is not → must be excluded from the picker.
const currencies = [
  { id: 'sgd', code: 'SGD', symbol: 'S$', colour: null, is_base: true, is_display_active: true, rate_to_base: '1.0' },
  { id: 'usd', code: 'USD', symbol: 'US$', colour: null, is_base: false, is_display_active: true, rate_to_base: '1.35' },
  { id: 'eur', code: 'EUR', symbol: '€', colour: null, is_base: false, is_display_active: false, rate_to_base: '1.5' },
] as unknown as Currency[]

function renderPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<DisplayCurrencyPicker />, { wrapper })
}

function setPerson(displayCurrency: string) {
  useAuthStore.setState({ currentPerson: { personId: 'p1', displayCurrency } as unknown as Person })
}

beforeEach(() => {
  setPerson('native')
  vi.spyOn(api, 'get').mockResolvedValue({ data: { items: currencies, total: currencies.length }, status: 200 })
  vi.spyOn(api, 'patch').mockImplementation((_url, body) =>
    Promise.resolve({ data: { personId: 'p1', ...(body as object) } as unknown as Person, status: 200 }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ currentPerson: null })
})

describe('DisplayCurrencyPicker', () => {
  test('offers Native + display-active currencies only (no Household/Individual controls)', async () => {
    renderPicker()
    // Trigger shows the active mode (Native default).
    const trigger = await screen.findByRole('button')
    expect(trigger.textContent).toContain('Native')
    fireEvent.click(trigger)
    expect(await screen.findByRole('option', { name: 'Native' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'SGD' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'USD' })).toBeTruthy()
    // EUR is not display-active → excluded.
    expect(screen.queryByRole('option', { name: 'EUR' })).toBeNull()
    // P0: only the currency picker — no view-scope controls (Story 9.7).
    expect(screen.queryByText('Household')).toBeNull()
    expect(screen.queryByText('Individual')).toBeNull()
  })

  test('picking a currency PATCHes /api/profile with that code', async () => {
    renderPicker()
    fireEvent.click(await screen.findByRole('button'))
    // USD is an async (query-loaded) option — await it so the click doesn't race the currencies fetch.
    fireEvent.click(await screen.findByRole('option', { name: 'USD' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/profile', { displayCurrency: 'USD' }),
    )
  })

  test('picking Native PATCHes the native sentinel', async () => {
    setPerson('USD')
    renderPicker()
    fireEvent.click(await screen.findByRole('button'))
    fireEvent.click(screen.getByRole('option', { name: 'Native' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/profile', { displayCurrency: 'native' }),
    )
  })
})
