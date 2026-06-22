import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryTree } from '../src/components/category/CategoryTree'
import { resolveMove } from '../src/components/category/resolveMove'
import type { Category } from '../src/types/category'

const cat = (over: Partial<Category>): Category => ({
  id: 'x',
  status: 'active',
  name: 'X',
  color: '#3b82f6',
  icon: null,
  category_type: 'expense',
  parent_id: null,
  depth: 0,
  vivid: false,
  can_delete: true,
  delete_blocked_reason: null,
  ...over,
})

const items: Category[] = [
  cat({ id: 'p1', name: 'Food', color: '#f59e0b', icon: '🍔', can_delete: false, delete_blocked_reason: 'has subcategories' }),
  cat({ id: 'c1', name: 'Groceries', parent_id: 'p1', depth: 1, color: '#f59e0b' }),
  cat({ id: 'p2', name: 'Salary', category_type: 'income', depth: 0 }),
]

const noop = {
  onEdit: () => {},
  onAddSubcategory: () => {},
  onArchive: () => {},
  onRestore: () => {},
  onDelete: () => {},
  onMove: () => {},
  selectedIds: new Set<string>(),
  onToggleSelect: () => {},
}

const rowOf = (text: string) =>
  screen.getByText(text).closest('[data-testid="category-tree-row"]') as HTMLElement

describe('CategoryTree', () => {
  test('renders parent and (expanded) subcategory rows', () => {
    render(<CategoryTree items={items} {...noop} />)
    expect(screen.getByText('Food')).toBeTruthy()
    expect(screen.getByText('Groceries')).toBeTruthy() // child visible (default expanded)
    expect(screen.getByText('Salary')).toBeTruthy()
  })

  test('parent ⋮ menu offers Edit, Add subcategory, Archive, Delete (3.2)', () => {
    const onEdit = vi.fn()
    render(<CategoryTree items={items} {...noop} onEdit={onEdit} />)

    fireEvent.click(screen.getByLabelText('Actions for Food'))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Add subcategory' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(items[0])
  })

  test('Delete is disabled with the reason when can_delete is false', () => {
    const onDelete = vi.fn()
    render(<CategoryTree items={items} {...noop} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('Actions for Food'))

    const del = screen.getByRole('menuitem', { name: 'Delete' }) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(del.title).toBe('has subcategories')
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
  })

  test('sub ⋮ menu offers Promote + Move-to per other parent', () => {
    const onMove = vi.fn()
    render(<CategoryTree items={items} {...noop} onMove={onMove} />)
    fireEvent.click(screen.getByLabelText('Actions for Groceries'))

    fireEvent.click(screen.getByRole('menuitem', { name: 'Promote to top level' }))
    expect(onMove).toHaveBeenCalledWith('c1', null)

    fireEvent.click(screen.getByLabelText('Actions for Groceries'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Salary' }))
    expect(onMove).toHaveBeenCalledWith('c1', 'p2')
  })

  test('archived row: Archived badge + ⋮ trimmed to Restore + Delete only (no Edit/Archive)', () => {
    const archived = [cat({ id: 'p1', name: 'Food', status: 'archived' })]
    render(<CategoryTree items={archived} {...noop} />)
    expect(screen.getByText('Archived')).toBeTruthy()
    expect(rowOf('Food').className).toContain('grayscale')

    fireEvent.click(screen.getByLabelText('Actions for Food'))
    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Add subcategory' })).toBeNull()
  })

  test('only movable rows show a drag handle (sub + childless top-level; not a parent-with-children)', () => {
    render(<CategoryTree items={items} {...noop} />)
    expect(screen.getByLabelText('Drag Salary')).toBeTruthy() // childless top-level
    expect(screen.getByLabelText('Drag Groceries')).toBeTruthy() // sub
    expect(screen.queryByLabelText('Drag Food')).toBeNull() // has a child → no valid move
  })

  test('collapsing a parent hides its children', () => {
    render(<CategoryTree items={items} {...noop} />)
    expect(screen.getByText('Groceries')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Collapse Food'))
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  test('each row renders a selection checkbox; toggling one calls onToggleSelect (3.4)', () => {
    const onToggleSelect = vi.fn()
    render(<CategoryTree items={items} {...noop} onToggleSelect={onToggleSelect} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Food' }))
    expect(onToggleSelect).toHaveBeenCalledWith('p1')
  })

  test('a selected row keeps the entity fill + adds the accent ring (3.4)', () => {
    // Selection no longer swaps in a neutral surface fill (owner exec decision 2026-06-22 — no neutral
    // theme tokens on an entity surface); it keeps the entity tint and layers the accent ring on top.
    render(<CategoryTree items={items} {...noop} selectedIds={new Set(['p1'])} />)
    const row = rowOf('Food')
    expect(row.getAttribute('data-selected')).toBe('true')
    expect(row.className).toContain('bg-entity-fill-calm')
    expect(row.className).not.toContain('bg-surface-active')
    expect(row.className).toContain('ring-accent')
  })

  test('rows carry no 4px left accent bar element', () => {
    const { container } = render(<CategoryTree items={items} {...noop} />)
    expect(container.querySelector('.border-l-4')).toBeNull()
    expect(container.querySelectorAll('[data-testid="category-tree-row"]').length).toBe(3)
  })
})

// The drag OUTCOME is a pure function (dnd-kit gestures can't be driven via fireEvent in jsdom).
describe('resolveMove', () => {
  test('subcategory → a parent block re-parents it', () => {
    expect(resolveMove('c1', 'parent:p2', items)).toEqual({ id: 'c1', parentId: 'p2' })
  })
  test('subcategory → the root zone promotes it', () => {
    expect(resolveMove('c1', 'root', items)).toEqual({ id: 'c1', parentId: null })
  })
  test('childless top-level → a parent block nests it', () => {
    expect(resolveMove('p2', 'parent:p1', items)).toEqual({ id: 'p2', parentId: 'p1' })
  })
  test('top-level WITH children → a parent block is blocked (would be 3 levels)', () => {
    expect(resolveMove('p1', 'parent:p2', items)).toBeNull()
  })
  test('subcategory → its own parent is a no-op', () => {
    expect(resolveMove('c1', 'parent:p1', items)).toBeNull()
  })
  test('top-level → the root zone is a no-op', () => {
    expect(resolveMove('p2', 'root', items)).toBeNull()
  })
  test('dropping onto an archived parent is rejected (would orphan the child)', () => {
    const withArchived = [...items, cat({ id: 'p3', name: 'Old', status: 'archived' })]
    expect(resolveMove('c1', 'parent:p3', withArchived)).toBeNull()
  })
  test('drop outside any target resolves to null', () => {
    expect(resolveMove('c1', null, items)).toBeNull()
  })
})
