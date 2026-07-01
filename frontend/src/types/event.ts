import type { BaseEntity } from './entity'

// Transaction — the `transaction` subtype of the STI `financial_events` (ARCH §3.6, Story 5.1).
// Snake_case wire (generic-entity surface). Money fields (`amount`/`amount_base`/…) arrive as JSON
// numbers from FastAPI; coerce to strings at the MonetaryValue call site (money is a Decimal of
// record — never do float math on these). `amount_base_source` is the DERIVED FX-source indicator
// (formula|spot|manual) the server computes — not a stored column (ARCH §3.2).
export interface Transaction extends BaseEntity {
  event_type: string
  name: string | null
  event_date: string
  transaction_status: string
  transaction_type: 'inflow' | 'outflow' | null
  category_id: string | null
  payee_person_id: string | null
  payment_method: string | null
  source_account_id: string | null
  is_shared_expense: boolean
  is_gst_claimable: boolean
  notes: string | null
  source: string

  currency: string
  amount: string
  fx_rate: string
  amount_base_calculated: string
  amount_base: string
  fx_delta: string | null
  fee_amount: string | null
  fx_rate_date: string | null

  created_by: string
  updated_at: string

  amount_base_source: 'formula' | 'spot' | 'manual'
}

// The POST /api/events body (Story 5.1). Everything FX-derived + provenance is server-set; the client
// sends the entered money + the optional bank-statement `amount_base` override.
export interface TransactionCreate {
  name: string
  event_date: string
  transaction_type: 'inflow' | 'outflow'
  category_id?: string | null
  payee_person_id?: string | null
  payment_method?: string | null
  source_account_id?: string | null
  notes?: string | null
  is_shared_expense?: boolean
  is_gst_claimable?: boolean
  currency: string
  amount: string
  amount_base?: string | null
  fee_amount?: string | null
}
