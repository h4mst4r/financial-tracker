import { describe, it, expect } from 'vitest'
import { nextSort, sortRows, shouldCommit, shouldFetchNext } from '../src/components/primitives/tableLogic'

interface Row {
  id: string
  date: string
  amount: number
}
const rows: Row[] = [
  { id: 'a', date: '2026-01-03', amount: 50 },
  { id: 'b', date: '2026-01-01', amount: 50 },
  { id: 'c', date: '2026-01-02', amount: 10 },
]
const valueFor = (row: Row, key: string) => (key === 'date' ? row.date : row.amount)

describe('nextSort (header-click decision)', () => {
  it('starts a new column ascending', () => {
    expect(nextSort(null, 'date')).toEqual({ key: 'date', dir: 'asc' })
    expect(nextSort({ key: 'amount', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' })
  })
  it('toggles direction when clicking the same column', () => {
    expect(nextSort({ key: 'date', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' })
    expect(nextSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' })
  })
})

describe('sortRows', () => {
  it('passes through (copy) when sort is null', () => {
    const out = sortRows(rows, null, valueFor)
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(out).not.toBe(rows) // new array — never mutates input
  })
  it('sorts ascending and descending by string key', () => {
    expect(sortRows(rows, { key: 'date', dir: 'asc' }, valueFor).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(sortRows(rows, { key: 'date', dir: 'desc' }, valueFor).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })
  it('sorts numerically by number key', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'asc' }, valueFor).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })
  it('is stable within ties (a before b keep input order on equal amounts)', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'asc' }, valueFor).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(sortRows(rows, { key: 'amount', dir: 'desc' }, valueFor).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('does not mutate the source array', () => {
    const before = rows.map((r) => r.id)
    sortRows(rows, { key: 'amount', dir: 'desc' }, valueFor)
    expect(rows.map((r) => r.id)).toEqual(before)
  })
})

describe('shouldCommit (inline-edit commit decision)', () => {
  it('commits on Enter and blur-out', () => {
    expect(shouldCommit('enter')).toBe(true)
    expect(shouldCommit('blur-out')).toBe(true)
  })
  it('does not commit on Esc or blur-within (popup opened inside the cell)', () => {
    expect(shouldCommit('escape')).toBe(false)
    expect(shouldCommit('blur-within')).toBe(false)
  })
})

describe('shouldFetchNext (infinite keyset paging decision)', () => {
  const base = { rowCount: 100, overscan: 8, hasNextPage: true, isFetchingNextPage: false }
  it('fetches once the last mounted row is within `overscan` of the end', () => {
    expect(shouldFetchNext({ ...base, lastIndex: 91 })).toBe(true) // 91 >= 100-1-8 = 91
    expect(shouldFetchNext({ ...base, lastIndex: 99 })).toBe(true)
  })
  it('does not fetch while still far from the bottom', () => {
    expect(shouldFetchNext({ ...base, lastIndex: 50 })).toBe(false)
  })
  it('does not fetch when there is no next page (terminates the scroll)', () => {
    expect(shouldFetchNext({ ...base, lastIndex: 99, hasNextPage: false })).toBe(false)
  })
  it('does not re-fire while a fetch is already in flight', () => {
    expect(shouldFetchNext({ ...base, lastIndex: 99, isFetchingNextPage: true })).toBe(false)
  })
  it('does not fetch on an empty source', () => {
    expect(shouldFetchNext({ ...base, lastIndex: -1, rowCount: 0 })).toBe(false)
  })
})
