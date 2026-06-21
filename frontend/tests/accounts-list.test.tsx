import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AccountsList } from '../src/pages/AccountsList'
import type { Account } from '../src/types/account'
import type { Currency } from '../src/types/currency'
import { api } from '../src/api/client'

const currencies: Currency[] = [
  {
    id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', colour: null, vivid: false,
    is_base: true, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
    last_rate_at: null, rate_source: null, rate_history: [],
  },
]

const accounts: Account[] = [
  {
    id: 'b1', account_type: 'bank', name: 'DBS Multiplier', institution: 'DBS', notes: null,
    colour: '#6366f1', vivid: true, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], opening_balance: '12840.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'c1', account_type: 'capital', name: 'Stocks', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], investment_type: null, cost_basis: '5000.0000',
  },
]

function renderPage(subtypes: Account['account_type'][] = ['bank', 'credit_card']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<AccountsList subtypes={subtypes} title="Accounts" newLabel="account" />, { wrapper })
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url.startsWith('/api/currencies')) {
      return Promise.resolve({ data: { items: currencies, total: currencies.length }, status: 200 })
    }
    return Promise.resolve({ data: { items: accounts, total: accounts.length }, status: 200 })
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: {}, status: 201 })
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {}, status: 200 })
})
afterEach(() => vi.restoreAllMocks())

describe('AccountsList', () => {
  test('renders only the cards matching the route subtypes', async () => {
    renderPage(['bank', 'credit_card'])
    expect(await screen.findByText('DBS Multiplier')).toBeTruthy()
    // Capital is filtered out on the /accounts route.
    expect(screen.queryByText('Stocks')).toBeNull()
  })

  test('a vivid account renders the vivid EntityCard fill', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    const card = screen.getByTestId('entity-card')
    expect(card.getAttribute('data-vivid')).toBe('true')
  })

  test('New → the type Dropdown swaps the opening-balance fields in/out', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // Default type is bank (ledger-backed) → opening balance shown.
    expect(await screen.findByText('Opening balance')).toBeTruthy()
    // Switch to capital (asset-like) → opening balance hidden.
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Capital' }))
    expect(screen.queryByText('Opening balance')).toBeNull()
  })

  test('saving a bank POSTs the subtype-shaped payload', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Bank' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({
          account_type: 'bank',
          name: 'My Bank',
          opening_balance: '1000',
          vivid: false,
        }),
      ),
    )
  })
})
