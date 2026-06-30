import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, textColumn } from '../src/components/primitives'
import type { ColumnDef } from '../src/components/primitives'

// Story 5f-8 — Table `virtualized` (DOM windowing) + `infinite` (server keyset paging seam) modes.
// jsdom has no layout, so react-virtual (which measures the scroll element via offsetWidth/offsetHeight)
// reads a 0-sized viewport and windows down to nothing. We stub those getters to a fixed viewport so a
// real, bounded window renders — which is exactly the bounded-DOM property under test. Real scroll
// smoothness is verified live on /design-system (P1); the near-bottom seam logic is also unit-tested in
// table-logic.test.ts (shouldFetchNext).
const VIEWPORT_W = 800
const VIEWPORT_H = 400
const origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => VIEWPORT_W })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => VIEWPORT_H })
})
afterAll(() => {
  if (origW) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origW)
  if (origH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origH)
})

interface Row {
  id: string
  name: string
}
const nameColumn: ColumnDef<Row> = { key: 'name', header: 'Name', render: (r) => r.name }
const editableName = textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name, editable: true })
const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }))

describe('Table — virtualized (DOM windowing, AC#1/#2)', () => {
  it('mounts a bounded number of rows for a 10,000-row dataset (DOM ≪ data)', () => {
    const { container } = render(
      <Table rows={makeRows(10_000)} columns={[nameColumn]} rowKey={(r) => r.id} virtualized />,
    )
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(bodyRows.length).toBeGreaterThan(0)
    expect(bodyRows.length).toBeLessThan(100) // windowed, not 10k
    // The far row is not mounted; an early row is.
    expect(screen.queryByText('Row 9999')).toBeNull()
    expect(screen.getByText('Row 0')).toBeInTheDocument()
  })

  it('non-virtualized render is unchanged (every row mounts)', () => {
    const { container } = render(<Table rows={makeRows(40)} columns={[nameColumn]} rowKey={(r) => r.id} />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40)
  })

  it('inline edit still opens and commits under virtualization', () => {
    const onCellCommit = vi.fn()
    render(
      <Table rows={makeRows(500)} columns={[editableName]} rowKey={(r) => r.id} virtualized inlineEdit onCellCommit={onCellCommit} />,
    )
    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Edit Name' })[0])
    const input = screen.getByDisplayValue('Row 0')
    fireEvent.change(input, { target: { value: 'edited' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCellCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r0' }), 'name', 'edited')
  })

  it('a scroll re-render keeps the active editor mounted (overscan buffer)', () => {
    const { container } = render(
      <Table rows={makeRows(500)} columns={[editableName]} rowKey={(r) => r.id} virtualized inlineEdit onCellCommit={vi.fn()} />,
    )
    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Edit Name' })[0])
    expect(screen.getByDisplayValue('Row 0')).toBeInTheDocument()
    const scroller = container.querySelector('.max-h-ledger') as HTMLElement
    fireEvent.scroll(scroller, { target: { scrollTop: 20 } }) // small scroll within the buffer
    expect(screen.getByDisplayValue('Row 0')).toBeInTheDocument() // editor survives the windowing re-render
  })
})

describe('Table — infinite (keyset paging seam, AC#4/#5)', () => {
  it('calls the consumer fetchNextPage once near the bottom', () => {
    const fetchNextPage = vi.fn()
    render(
      <Table
        rows={makeRows(10)}
        columns={[nameColumn]}
        rowKey={(r) => r.id}
        virtualized
        infinite={{ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }}
      />,
    )
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('renders a loading sentinel while fetching — never a numbered pager', () => {
    const { container } = render(
      <Table
        rows={makeRows(10)}
        columns={[nameColumn]}
        rowKey={(r) => r.id}
        virtualized
        infinite={{ hasNextPage: true, isFetchingNextPage: true, fetchNextPage: vi.fn() }}
      />,
    )
    expect(screen.getByTestId('infinite-sentinel')).toBeInTheDocument()
    // No numbered-page pager (UX line 481).
    expect(container.querySelector('[aria-label*="page" i]')).toBeNull()
    expect(screen.queryByRole('navigation', { name: /pag/i })).toBeNull()
  })

  it('stops fetching and hides the sentinel once hasNextPage is false (terminates)', () => {
    const fetchNextPage = vi.fn()
    render(
      <Table
        rows={makeRows(10)}
        columns={[nameColumn]}
        rowKey={(r) => r.id}
        virtualized
        infinite={{ hasNextPage: false, isFetchingNextPage: false, fetchNextPage }}
      />,
    )
    expect(fetchNextPage).not.toHaveBeenCalled()
    expect(screen.queryByTestId('infinite-sentinel')).toBeNull()
  })
})
