import { describe, it, expect } from 'vitest'
import {
  applyCellEdit,
  canMutateRow,
  cellCommitPayload,
  isCellField,
  type CellField,
} from '../src/pages/transactionsQuery'
import type { Transaction } from '../src/types/event'

// The pure inline-edit cell mappings + per-row permission (Story 5.3, AC1/AC3).

describe('cellCommitPayload — column key → TransactionUpdate field', () => {
  it('maps each editable column to its PATCH field', () => {
    expect(cellCommitPayload('event_date', '2026-06-20')).toEqual({ event_date: '2026-06-20' })
    expect(cellCommitPayload('name', 'Brunch')).toEqual({ name: 'Brunch' })
    expect(cellCommitPayload('payee', 'p-1')).toEqual({ payee_person_id: 'p-1' })
    expect(cellCommitPayload('category', 'c-1')).toEqual({ category_id: 'c-1' })
    expect(cellCommitPayload('currency', 'USD')).toEqual({ currency: 'USD' })
    expect(cellCommitPayload('amount', '20')).toEqual({ amount: '20' })
  })

  it('Base column commits amount_base — the FX manual override (§12.7)', () => {
    expect(cellCommitPayload('amount_base', '140')).toEqual({ amount_base: '140' })
  })
})

describe('isCellField — only the editable ledger columns are commit keys', () => {
  it('accepts the editable keys and rejects the rest (status, __actions, unknown)', () => {
    for (const k of ['event_date', 'name', 'payee', 'category', 'currency', 'amount', 'amount_base']) {
      expect(isCellField(k)).toBe(true)
    }
    expect(isCellField('status')).toBe(false)
    expect(isCellField('__actions')).toBe(false)
    expect(isCellField('nope')).toBe(false)
  })
})

describe('applyCellEdit — optimistic in-cache patch', () => {
  const row = { id: 't1', name: 'Old', category_id: null } as unknown as Transaction
  it('sets the mapped field, leaving the rest intact', () => {
    expect(applyCellEdit(row, 'name', 'New').name).toBe('New')
    expect(applyCellEdit(row, 'category' as CellField, 'c-9').category_id).toBe('c-9')
    expect(applyCellEdit(row, 'name', 'New').id).toBe('t1') // untouched
  })
})

describe('canMutateRow — Member own-rows only; Admin/Owner any (AC3)', () => {
  const row = { created_by: 'p-owner' } as Transaction
  it('a member may act only on rows they created', () => {
    expect(canMutateRow({ role: 'member', personId: 'p-owner' }, row)).toBe(true)
    expect(canMutateRow({ role: 'member', personId: 'p-other' }, row)).toBe(false)
  })
  it('admin and owner may act on any row', () => {
    expect(canMutateRow({ role: 'admin', personId: 'p-other' }, row)).toBe(true)
    expect(canMutateRow({ role: 'owner', personId: 'p-other' }, row)).toBe(true)
  })
  it('no signed-in person → no mutation', () => {
    expect(canMutateRow(null, row)).toBe(false)
  })
})
