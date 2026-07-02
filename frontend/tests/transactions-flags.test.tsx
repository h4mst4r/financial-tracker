import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactionFlags } from '../src/pages/TransactionFlags'
import type { Transaction } from '../src/types/event'

// Story 5.5 — the ledger behavioural-flag icons (UX §751 / §11 TRANSACTION_FLAG_ICON, AC1/AC2).
// A non-shared OUTFLOW shows the personal glyph (UserRound); a GST-claimable row shows the GST glyph
// (Receipt). Shared is the quiet default → no personal flag. Icons are aria-labelled (L15) — queried
// here by accessible name, never by colour.

const PERSONAL = 'Personal expense'
const GST = 'GST-claimable'

// Minimal Transaction factory — only the fields the flags read; the rest are inert defaults.
const mk = (over: Partial<Transaction>): Transaction =>
  ({
    id: 't1',
    status: 'active',
    event_type: 'transaction',
    name: 'Groceries',
    event_date: '2026-07-02',
    transaction_status: 'completed',
    transaction_type: 'outflow',
    category_id: null,
    payee_person_id: null,
    payment_method: 'cash',
    source_account_id: null,
    is_shared_expense: true,
    is_gst_claimable: false,
    notes: null,
    source: 'manual',
    currency: 'SGD',
    amount: '10',
    fx_rate: '1',
    amount_base_calculated: '10',
    amount_base: '10',
    fx_delta: null,
    fee_amount: null,
    fx_rate_date: null,
    created_by: 'me',
    updated_at: '2026-07-02',
    amount_base_source: 'spot',
    ...over,
  }) as Transaction

describe('TransactionFlags — ledger behavioural-flag icons (AC1/AC2)', () => {
  it('a non-shared outflow shows the personal glyph (AC1)', () => {
    render(<TransactionFlags transaction={mk({ is_shared_expense: false, transaction_type: 'outflow' })} />)
    expect(screen.getByLabelText(PERSONAL)).toBeInTheDocument()
    expect(screen.queryByLabelText(GST)).not.toBeInTheDocument()
  })

  it('a shared outflow shows NO personal glyph (shared is the quiet default, AC1)', () => {
    render(<TransactionFlags transaction={mk({ is_shared_expense: true, transaction_type: 'outflow' })} />)
    expect(screen.queryByLabelText(PERSONAL)).not.toBeInTheDocument()
  })

  it('a non-shared inflow shows NO personal glyph (predicate is outflow-only, AC1)', () => {
    // An inflow can never be shared (server/DB coerce is_shared_expense False), so flagging it
    // "personal" would be noise — the predicate requires transaction_type === 'outflow'.
    render(<TransactionFlags transaction={mk({ is_shared_expense: false, transaction_type: 'inflow' })} />)
    expect(screen.queryByLabelText(PERSONAL)).not.toBeInTheDocument()
  })

  it('a GST-claimable row shows the GST glyph (AC2)', () => {
    render(<TransactionFlags transaction={mk({ is_gst_claimable: true })} />)
    expect(screen.getByLabelText(GST)).toBeInTheDocument()
  })

  it('a non-GST row shows NO GST glyph (AC2)', () => {
    render(<TransactionFlags transaction={mk({ is_gst_claimable: false })} />)
    expect(screen.queryByLabelText(GST)).not.toBeInTheDocument()
  })

  it('a shared, non-GST outflow renders nothing (no empty cluster)', () => {
    const { container } = render(
      <TransactionFlags transaction={mk({ is_shared_expense: true, is_gst_claimable: false })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('a non-shared GST-claimable outflow shows both glyphs (AC1+AC2)', () => {
    render(
      <TransactionFlags
        transaction={mk({ is_shared_expense: false, is_gst_claimable: true, transaction_type: 'outflow' })}
      />,
    )
    expect(screen.getByLabelText(PERSONAL)).toBeInTheDocument()
    expect(screen.getByLabelText(GST)).toBeInTheDocument()
  })
})
