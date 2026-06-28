import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Table, dateColumn, textColumn, moneyColumn, selectColumn } from '../src/components/primitives'
import type { ColumnDef } from '../src/components/primitives'

interface Row {
  id: string
  status: 'active' | 'archived'
  date: string
  name: string
  amount: string
}
const baseRows: Row[] = [
  { id: 'a', status: 'active', date: '2026-01-03', name: 'Alpha', amount: '50' },
  { id: 'b', status: 'active', date: '2026-01-01', name: 'Bravo', amount: '10' },
]

function makeColumns(): ColumnDef<Row>[] {
  return [
    textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name, editable: true }),
    moneyColumn<Row>({ key: 'amount', header: 'Amount', get: (r) => r.amount, currencyOf: () => 'SGD', editable: true }),
  ]
}

describe('Table — shell + rendering', () => {
  it('renders a row per item with the declared columns', () => {
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sort by Name/i })).toBeInTheDocument()
  })

  it('shows emptyContent when there are no rows', () => {
    render(<Table rows={[]} columns={makeColumns()} rowKey={(r) => r.id} emptyContent="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders a loading Skeleton instead of rows', () => {
    const { container } = render(<Table rows={[]} columns={makeColumns()} rowKey={(r) => r.id} loading />)
    expect(container.querySelector('.animate-shimmer')).not.toBeNull()
  })

  it('sorts internally on header click (no controlled sort props)', () => {
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} />)
    fireEvent.click(screen.getByRole('button', { name: /Sort by Name/i }))
    const names = screen.getAllByText(/Alpha|Bravo/).map((n) => n.textContent)
    expect(names).toEqual(['Alpha', 'Bravo']) // asc: A before B
    fireEvent.click(screen.getByRole('button', { name: /Sort by Name/i }))
    const desc = screen.getAllByText(/Alpha|Bravo/).map((n) => n.textContent)
    expect(desc).toEqual(['Bravo', 'Alpha']) // desc toggles
  })

  it('every data column is sortable by default (§12.2); sortable:false opts out', () => {
    render(
      <Table
        rows={baseRows}
        columns={[
          textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name }),
          textColumn<Row>({ key: 'note', header: 'Note', get: () => '', sortable: false }),
        ]}
        rowKey={(r) => r.id}
      />,
    )
    expect(screen.getByRole('button', { name: /Sort by Name/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sort by Note/i })).toBeNull()
  })

  it('controlled sort calls onSortChange and does not self-sort', () => {
    const onSortChange = vi.fn()
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} sort={null} onSortChange={onSortChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Sort by Name/i }))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', dir: 'asc' })
  })
})

describe('Table — inline cell edit (§12.3a contract)', () => {
  const openNameEditor = () => {
    const cell = screen.getAllByRole('button', { name: 'Edit Name' })[0] // first data row (Alpha)
    fireEvent.doubleClick(cell)
    return screen.getByDisplayValue('Alpha')
  }

  it('double-click swaps to the editControl; Enter commits via onCellCommit', () => {
    const onCellCommit = vi.fn()
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} inlineEdit onCellCommit={onCellCommit} />)
    const input = openNameEditor()
    fireEvent.change(input, { target: { value: 'Alpha2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCellCommit).toHaveBeenCalledWith(baseRows[0], 'name', 'Alpha2')
  })

  it('Esc cancels — no commit, editor closes', () => {
    const onCellCommit = vi.fn()
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} inlineEdit onCellCommit={onCellCommit} />)
    const input = openNameEditor()
    fireEvent.change(input, { target: { value: 'discard' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCellCommit).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('discard')).toBeNull()
  })

  it('does NOT double-commit when Enter is followed by a trailing blur (4.11 guard)', () => {
    const onCellCommit = vi.fn()
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} inlineEdit onCellCommit={onCellCommit} />)
    const input = openNameEditor()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input) // unmount can fire a trailing blur — must be ignored
    expect(onCellCommit).toHaveBeenCalledTimes(1)
  })

  it('blur-within keeps the editor open (a popup opened INSIDE the cell must not close it — DatePicker/Dropdown contract)', () => {
    const onCellCommit = vi.fn()
    // An editControl that renders an extra focusable child inside the cell, mimicking a DatePicker/Dropdown
    // popup (which nests its panel inside the editor's DOM). Focus moving to it is a "blur-within".
    const cols: ColumnDef<Row>[] = [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        sortValue: (r) => r.name,
        render: (r) => r.name,
        editable: true,
        editInitial: (r) => r.name,
        editControl: ({ value, setValue }) => (
          <>
            <input aria-label="name-edit" value={value} onChange={(e) => setValue(e.target.value)} />
            <button type="button" data-testid="in-cell-popup">popup</button>
          </>
        ),
      },
    ]
    render(<Table rows={baseRows} columns={cols} rowKey={(r) => r.id} inlineEdit onCellCommit={onCellCommit} />)
    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Edit Name' })[0])
    const input = screen.getByLabelText('name-edit')
    fireEvent.blur(input, { relatedTarget: screen.getByTestId('in-cell-popup') }) // focus → popup inside the cell
    expect(onCellCommit).not.toHaveBeenCalled() // must NOT commit
    expect(screen.getByLabelText('name-edit')).toBeInTheDocument() // editor still open (not torn down)
  })

  it('respects canEditRow — a blocked row has no edit affordance', () => {
    render(
      <Table
        rows={baseRows}
        columns={makeColumns()}
        rowKey={(r) => r.id}
        inlineEdit
        canEditRow={(r) => r.id === 'a'}
      />,
    )
    // Row a is editable (button), row b is not (plain text, no edit button).
    expect(screen.getByRole('button', { name: 'Edit Name' })).toBeInTheDocument()
    const editButtons = screen.queryAllByRole('button', { name: 'Edit Name' })
    expect(editButtons).toHaveLength(1) // only row a, not row b
  })

  it('no inline edit when inlineEdit is off (read-only surface leaks no affordance)', () => {
    render(<Table rows={baseRows} columns={makeColumns()} rowKey={(r) => r.id} />)
    expect(screen.queryByRole('button', { name: 'Edit Name' })).toBeNull()
  })
})

describe('Table — column vocabulary + pinned slots', () => {
  it('selectColumn toggles selection; pinnedTop renders inside the table', () => {
    const onToggle = vi.fn()
    const cols: ColumnDef<Row>[] = [
      selectColumn<Row>({ isSelected: () => false, onToggle, rowLabel: (r) => r.name }),
      dateColumn<Row>({ key: 'date', get: (r) => r.date }),
    ]
    render(
      <Table
        rows={baseRows}
        columns={cols}
        rowKey={(r) => r.id}
        pinnedTop={<tr><td data-testid="quick-add">＋ add</td></tr>}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    expect(onToggle).toHaveBeenCalledWith(baseRows[0])
    expect(screen.getByTestId('quick-add')).toBeInTheDocument()
  })

  it('collapses to cards below md when renderCard is supplied', () => {
    const { container } = render(
      <Table
        rows={baseRows}
        columns={makeColumns()}
        rowKey={(r) => r.id}
        renderCard={(r) => <div data-testid={`card-${r.id}`}>{r.name}</div>}
      />,
    )
    // The card layer is present (md:hidden) alongside the table (hidden md:block).
    expect(within(container).getByTestId('card-a')).toBeInTheDocument()
    expect(container.querySelector('.md\\:hidden')).not.toBeNull()
    expect(container.querySelector('.hidden.md\\:block')).not.toBeNull()
  })
})
