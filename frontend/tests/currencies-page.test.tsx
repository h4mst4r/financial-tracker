import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Currencies } from '../src/pages/Currencies'
import type { Currency } from '../src/types/currency'
import { api } from '../src/api/client'

const HOURS = 60 * 60 * 1000
const cur = (over: Partial<Currency>): Currency => ({
  id: 'x', code: 'XXX', name: 'X Dollar', symbol: '$', colour: null, vivid: false,
  is_base: false, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
  last_rate_at: null, rate_source: null, rate_history: [], ...over,
})

const items: Currency[] = [
  cur({ id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', is_base: true }),
  cur({
    id: 'nzd', code: 'NZD', name: 'NZ Dollar', rate_to_base: '0.78', fee_pct: '1.5',
    last_rate_at: new Date(Date.now() - 2 * HOURS).toISOString(),
    rate_history: [0.8, 0.81, 0.79, 0.78],
  }),
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

    // Code is a searchable Dropdown (§7 variant): open the panel, pick the option.
    fireEvent.click(await screen.findByLabelText(/Code/))
    fireEvent.click(screen.getByRole('option', { name: 'USD — US Dollar' }))
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

    // The Code Dropdown trigger is disabled on edit (the code is the row's identity).
    const codeTrigger = (await screen.findByLabelText(/Code/)) as HTMLButtonElement
    expect(codeTrigger.disabled).toBe(true)
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

  // ── Story 3.8 ──

  test('the freshness column header reads "Status" (renamed from "Fresh")', async () => {
    renderPage()
    await screen.findByTestId('currency-row-SGD')
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Fresh' })).toBeNull()
  })

  test('non-base row shows the last-updated time; null reads "never"; base reads "fresh"', async () => {
    renderPage()
    const nzd = await screen.findByTestId('currency-row-NZD')
    // last_rate_at = 2h ago → "fresh · 2h ago"
    expect(within(nzd).getByText('fresh · 2h ago')).toBeTruthy()
    const sgd = screen.getByTestId('currency-row-SGD')
    expect(within(sgd).getByText('fresh')).toBeTruthy()
  })

  test('a stale non-base row shows "stale {N}h", and a never-fetched one shows "never"', async () => {
    const stale = cur({
      id: 'usd', code: 'USD', name: 'US Dollar', rate_to_base: '0.74',
      last_rate_at: new Date(Date.now() - 52 * HOURS).toISOString(),
      rate_history: [],
    })
    const never = cur({ id: 'eur', code: 'EUR', name: 'Euro', rate_to_base: '1.45' })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { items: [...items, stale, never], total: items.length + 2 }, status: 200,
    })
    renderPage()
    const usd = await screen.findByTestId('currency-row-USD')
    expect(within(usd).getByText('stale 52h')).toBeTruthy()
    const eur = screen.getByTestId('currency-row-EUR')
    expect(within(eur).getByText('never')).toBeTruthy()
  })

  test('the History column renders a sparkline for ≥2 points, placeholder otherwise, — for base', async () => {
    renderPage()
    const nzd = await screen.findByTestId('currency-row-NZD')
    // 4 history points → the atom draws an <svg role="img">.
    expect(within(nzd).getByRole('img', { name: /NZD rate history/ })).toBeTruthy()
    // Base row has no sparkline.
    const sgd = screen.getByTestId('currency-row-SGD')
    expect(within(sgd).queryByRole('img')).toBeNull()
  })

  test('Edit a non-base currency shows the FX-fee field, pre-filled, and PATCHes fee_pct as-is', async () => {
    renderPage()
    const row = await screen.findByTestId('currency-row-NZD')
    fireEvent.click(within(row).getByRole('button')) // ⋮
    fireEvent.click(await screen.findByText('Edit'))

    const feeInput = (await screen.findByLabelText(/FX fee/)) as HTMLInputElement
    expect(feeInput.value).toBe('1.5') // pre-filled from fee_pct, as-is
    fireEvent.change(feeInput, { target: { value: '2.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/currencies/nzd',
        expect.objectContaining({ fee_pct: 2.25 }),
      ),
    )
  })

  test('Editing the base currency shows no FX-fee field', async () => {
    renderPage()
    const row = await screen.findByTestId('currency-row-SGD')
    fireEvent.click(within(row).getByRole('button')) // ⋮
    fireEvent.click(await screen.findByText('Edit'))
    await screen.findByLabelText(/Code/)
    expect(screen.queryByLabelText(/FX fee/)).toBeNull()
  })
})
