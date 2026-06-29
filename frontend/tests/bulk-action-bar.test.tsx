import { describe, expect, test, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Edit, Copy, LineChart, Archive, Trash2 } from 'lucide-react'
import { BulkActionBar } from '../src/components/entity'
import type { BulkAction } from '../src/components/entity'

function makeActions(): {
  actions: BulkAction[]
  spies: Record<string, ReturnType<typeof vi.fn>>
} {
  const spies = {
    edit: vi.fn(),
    duplicate: vi.fn(),
    visualize: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
  }
  const actions: BulkAction[] = [
    { id: 'edit', label: 'Edit fields', icon: Edit, onClick: spies.edit },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, onClick: spies.duplicate },
    { id: 'visualize', label: 'Visualize', icon: LineChart, tone: 'accent', onClick: spies.visualize },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      disabled: true,
      disabledReason: 'Only the owner can delete',
      onClick: spies.delete,
    },
    { id: 'archive', label: 'Archive', icon: Archive, destructive: true, onClick: spies.archive },
  ]
  return { actions, spies }
}

describe('BulkActionBar', () => {
  test('renders nothing at zero selection', () => {
    const { actions } = makeActions()
    const { container, queryByTestId } = render(
      <BulkActionBar count={0} onClear={vi.fn()} actions={actions} />,
    )
    expect(queryByTestId('bulk-action-bar')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the count and a working Clear control at ≥1 selection', () => {
    const onClear = vi.fn()
    const { actions } = makeActions()
    const { getByText, getByTestId } = render(
      <BulkActionBar count={3} onClear={onClear} actions={actions} />,
    )
    expect(getByText('3 selected')).toBeTruthy()
    fireEvent.click(getByTestId('bulk-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  test('a non-disabled action fires its onClick', () => {
    const { actions, spies } = makeActions()
    const { getByTestId } = render(<BulkActionBar count={2} onClear={vi.fn()} actions={actions} />)
    fireEvent.click(getByTestId('bulk-action-edit'))
    expect(spies.edit).toHaveBeenCalledTimes(1)
  })

  test('the accent-toned action carries text-accent', () => {
    const { actions } = makeActions()
    const { getByTestId } = render(<BulkActionBar count={1} onClear={vi.fn()} actions={actions} />)
    expect(getByTestId('bulk-action-visualize').className).toContain('text-accent')
  })

  test('a destructive action carries text-error', () => {
    const { actions } = makeActions()
    const { getByTestId } = render(<BulkActionBar count={1} onClear={vi.fn()} actions={actions} />)
    expect(getByTestId('bulk-action-archive').className).toContain('text-error')
  })

  test('a disabled action is not clickable and exposes its reason', () => {
    const { actions, spies } = makeActions()
    const { getByTestId } = render(<BulkActionBar count={1} onClear={vi.fn()} actions={actions} />)
    const del = getByTestId('bulk-action-delete') as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(del.getAttribute('title')).toBe('Only the owner can delete')
    fireEvent.click(del)
    expect(spies.delete).not.toHaveBeenCalled()
  })

  test('an inline picker fires onPick with the chosen value (no modal, UX §8.6)', () => {
    const onPick = vi.fn()
    const actions: BulkAction[] = [
      {
        kind: 'picker',
        id: 'edit-type',
        label: 'Edit type',
        options: [
          { value: 'income', label: 'Income' },
          { value: 'expense', label: 'Expense' },
        ],
        onPick,
      },
    ]
    const { getByTestId, getByRole } = render(
      <BulkActionBar count={2} onClear={vi.fn()} actions={actions} />,
    )
    fireEvent.click(getByTestId('bulk-action-edit-type'))
    fireEvent.click(getByRole('option', { name: 'Income' }))
    expect(onPick).toHaveBeenCalledWith('income')
  })

  test('a disabled inline picker is not openable and exposes its reason', () => {
    const onPick = vi.fn()
    const actions: BulkAction[] = [
      {
        kind: 'picker',
        id: 'move',
        label: 'Move to…',
        options: [{ value: 'x', label: 'X' }],
        onPick,
        disabled: true,
        disabledReason: 'Only subcategories can be moved',
      },
    ]
    const { getByTestId } = render(<BulkActionBar count={1} onClear={vi.fn()} actions={actions} />)
    const trigger = getByTestId('bulk-action-move') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.closest('[title]')?.getAttribute('title')).toBe('Only subcategories can be moved')
    fireEvent.click(trigger)
    expect(onPick).not.toHaveBeenCalled()
  })

  test('destructive actions render after the non-destructive ones regardless of array order', () => {
    // Put a destructive action FIRST in the array; it must still render after the normal ones.
    const archiveFirst: BulkAction[] = [
      { id: 'archive', label: 'Archive', destructive: true, onClick: vi.fn() },
      { id: 'edit', label: 'Edit fields', onClick: vi.fn() },
    ]
    const { getByTestId } = render(
      <BulkActionBar count={1} onClear={vi.fn()} actions={archiveFirst} />,
    )
    const bar = getByTestId('bulk-action-bar')
    const buttons = Array.from(bar.querySelectorAll('[data-testid^="bulk-action-"]'))
    const order = buttons.map((b) => b.getAttribute('data-testid'))
    expect(order).toEqual(['bulk-action-edit', 'bulk-action-archive'])
  })
})
