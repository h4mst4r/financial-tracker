import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Currencies } from '../src/pages/Currencies'
import type { Currency } from '../src/types/currency'
import { api } from '../src/api/client'

const cur = (over: Partial<Currency>): Currency => ({
  id: 'x', code: 'XXX', name: 'X Dollar', symbol: '$', colour: null, vivid: false,
  is_base: false, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
  last_rate_at: null, rate_source: null, ...over,
})

const items: Currency[] = [
  cur({ id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', is_base: true }),
  cur({ id: 'nzd', code: 'NZD', name: 'NZ Dollar', rate_to_base: '0.78' }),
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<Currencies />, { wrapper })
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { items, total: items.length }, status: 200 })
  vi.spyOn(api, 'post').mockResolvedValue({ data: {}, status: 201 })
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {}, status: 200 })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: null, status: 204 })
})
afterEach(() => vi.restoreAllMocks())

describe('Currencies page', () => {
  test('renders a row per currency with the code shown', async () => {
    renderPage()
    expect(await screen.findByTestId('currency-row-SGD')).toBeTruthy()
    expect(screen.getByTestId('currency-row-NZD')).toBeTruthy()
    // Human-readable inverse rate for the non-base currency.
    expect(screen.getByText('1 SGD = 1.282 NZD')).toBeTruthy()
  })

  test('base currency has no display toggle and no Delete', async () => {
    renderPage()
    const baseRow = await screen.findByTestId('currency-row-SGD')
    // No display-active switch on the base row (it is always shown).
    expect(within(baseRow).queryByRole('switch')).toBeNull()
    // Open the base ⋮ menu — only Edit, no Delete.
    fireEvent.click(within(baseRow).getByRole('button'))
    expect(await screen.findByText('Edit')).toBeTruthy()
    expect(screen.queryByText('Delete')).toBeNull()
  })

  test('toggling a non-base display-active calls api.patch', async () => {
    renderPage()
    const row = await screen.findByTestId('currency-row-NZD')
    fireEvent.click(within(row).getByRole('switch'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/currencies/nzd', { is_display_active: false }),
    )
  })

  test('Add opens the modal, auto-fills name/symbol from the code, and POSTs uppercased', async () => {
    renderPage()
    await screen.findByTestId('currency-row-SGD')
    fireEvent.click(screen.getByTestId('entity-page-new'))

    const codeInput = await screen.findByLabelText(/Code/)
    fireEvent.change(codeInput, { target: { value: 'usd' } })
    // Name auto-filled from Intl (not the bare code).
    const nameInput = screen.getByLabelText(/Name/) as HTMLInputElement
    expect(nameInput.value.length).toBeGreaterThan(0)
    expect(nameInput.value).not.toBe('usd')

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/currencies',
        expect.objectContaining({ code: 'USD', is_display_active: true }),
      ),
    )
  })

  test('Edit keeps the Code read-only and PATCHes', async () => {
    renderPage()
    const row = await screen.findByTestId('currency-row-NZD')
    fireEvent.click(within(row).getByRole('button')) // ⋮
    fireEvent.click(await screen.findByText('Edit'))

    const codeInput = (await screen.findByLabelText(/Code/)) as HTMLInputElement
    expect(codeInput.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/currencies/nzd', expect.any(Object)))
  })

  test('Delete a non-base currency confirms then calls api.delete', async () => {
    renderPage()
    const row = await screen.findByTestId('currency-row-NZD')
    fireEvent.click(within(row).getByRole('button')) // ⋮
    fireEvent.click(await screen.findByText('Delete'))
    // ConfirmationDialog → confirm
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/currencies/nzd'))
  })
})
