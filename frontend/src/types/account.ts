// Account — an STI household entity (ARCH §3.5, Story 4.1). Snake_case wire keys (generic-entity
// surface). The response is a DISCRIMINATED UNION on `account_type` (ARCH §4.5): each subtype carries
// only its own columns. Money columns (`opening_balance`, `cost_basis`, …) are Decimals → JSON
// strings; format for display, never store as JS numbers. `owner_ids` is ≥1 (the creator on create;
// Story 4.3 adds more). Subtype deep fields are typed here (build-ahead) but only the shared fields +
// ledger-backed `opening_balance`/`opening_balance_date` are edited in Story 4.1 (4.7/4.8 add the rest).

export type AccountType = 'bank' | 'credit_card' | 'capital' | 'asset' | 'insurance'

interface AccountShared {
  id: string
  name: string
  // The account's native currency (ISO 4217) — `opening_balance`/snapshots are denominated in it
  // (Story 4.4). Editable only until the account has history, then locked.
  currency: string
  institution: string | null
  notes: string | null
  colour: string | null
  vivid: boolean
  status: 'active' | 'archived'
  created_by: string
  updated_at: string
  owner_ids: string[]
  // Hard-delete eligibility (UX §8.1, Story 4.2) — computed server-side from a dependency scan.
  can_delete: boolean
  delete_blocked_reason: string | null
  // Computed current value + its currency (no stored column, Story 4.4). `null` when an asset-like
  // account has no snapshot; the currency is NOT always the native code (a snapshot may differ).
  current_value: string | null
  current_value_currency: string | null
}

export interface BankAccount extends AccountShared {
  account_type: 'bank'
  opening_balance: string | null
  opening_balance_date: string | null
  account_number: string | null
  interest_rate: string | null
  interest_frequency: string | null
  reserved_amount: string | null
}

export interface CreditCardAccount extends AccountShared {
  account_type: 'credit_card'
  opening_balance: string | null
  opening_balance_date: string | null
  credit_limit: string | null
  billing_day: number | null
  due_day: number | null
  reward_points: number | null
  annual_fee: string | null
  reward_type: string | null
  bonus_limit: string | null
  points_expiry: string | null
}

export interface CapitalAccount extends AccountShared {
  account_type: 'capital'
  investment_type: string | null
  cost_basis: string | null
}

export interface AssetAccount extends AccountShared {
  account_type: 'asset'
  asset_type: string | null
  registration_no: string | null
  purchase_date: string | null
  purchase_value: string | null
}

export interface InsuranceAccount extends AccountShared {
  account_type: 'insurance'
  policy_no: string | null
  insurer: string | null
  policy_type: string | null
  policy_status: string | null
  premium_frequency: string | null
  coverage_death: string | null
  coverage_tpd: string | null
  coverage_ci: string | null
  coverage_early_ci: string | null
  coverage_personal_accident: string | null
  coverage_hospital: string | null
  surrender_value: string | null
  surrender_inquiry_date: string | null
}

export type Account =
  | BankAccount
  | CreditCardAccount
  | CapitalAccount
  | AssetAccount
  | InsuranceAccount

/** Ledger-backed subtypes anchor their value with an opening balance + date (FR-A-008). */
export const LEDGER_BACKED: ReadonlySet<AccountType> = new Set<AccountType>(['bank', 'credit_card'])

// A value snapshot (Story 4.4, ARCH §3.5). All wire keys are strings per the generic-entity
// convention; `value`/`value_base` are Decimals → JSON strings (format, never store as JS numbers).
export interface AccountSnapshot {
  id: string
  account_id: string
  snapshot_date: string
  value: string
  currency: string
  value_base: string
  source: string
  note: string | null
  created_at: string
}

export interface AccountSnapshotListOut {
  items: AccountSnapshot[]
  total: number
}
