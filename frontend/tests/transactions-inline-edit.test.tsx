import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, textColumn } from '../src/components/primitives'
import type { ColumnDef } from '../src/components/primitives'

// The inline-edit wiring the Transactions ledger passes to Table (Story 5.3, AC1/AC3): an editable
// column double-clicks into an editor and commits via onCellCommit, and canEditRow gates who may edit.

interface Row {
  id: string
  name: string
  created_by: string
}
const rows: Row[] = [
  { id: 'a', name: 'Alpha', created_by: 'me' },
  { id: 'b', name: 'Bravo', created_by: 'someone-else' },
]

function renderLedger(onCellCommit: (row: Row, key: string, value: string) => void) {
  const columns: ColumnDef<Row>[] = [
    textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name, editable: true }),
  ]
  // canEditRow mirrors the page's canMutate: only rows created_by 'me' are editable.
  return render(
    <Table
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      inlineEdit
      canEditRow={(r) => r.created_by === 'me'}
      onCellCommit={onCellCommit}
    />,
  )
}

describe('Transactions inline edit — Table wiring (AC1/AC3)', () => {
  it('double-click → editor → Enter commits the new value via onCellCommit', () => {
    const onCellCommit = vi.fn()
    renderLedger(onCellCommit)

    // The editable, permitted cell exposes an "Edit Name" affordance.
    const editButton = screen.getByRole('button', { name: 'Edit Name' })
    fireEvent.doubleClick(editButton)

    const input = screen.getByDisplayValue('Alpha')
    fireEvent.change(input, { target: { value: 'Alpha edited' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCellCommit).toHaveBeenCalledWith(rows[0], 'name', 'Alpha edited')
  })

  it('Esc cancels without committing', () => {
    const onCellCommit = vi.fn()
    renderLedger(onCellCommit)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Edit Name' }))
    const input = screen.getByDisplayValue('Alpha')
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCellCommit).not.toHaveBeenCalled()
  })

  it('a row the person may not edit exposes no edit affordance (canEditRow gate)', () => {
    renderLedger(vi.fn())
    // Only row 'a' (created_by 'me') is editable → exactly one "Edit Name" button; 'Bravo' is plain.
    expect(screen.getAllByRole('button', { name: 'Edit Name' })).toHaveLength(1)
    expect(screen.getByText('Bravo')).toBeInTheDocument()
  })
})
