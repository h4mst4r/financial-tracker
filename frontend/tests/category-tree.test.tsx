import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryTree } from '../src/components/category/CategoryTree'
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
  ...over,
})

const items: Category[] = [
  cat({ id: 'p1', name: 'Food', color: '#f59e0b', icon: '🍔' }),
  cat({ id: 'c1', name: 'Groceries', parent_id: 'p1', depth: 1, color: '#f59e0b' }),
  cat({ id: 'p2', name: 'Salary', category_type: 'income', depth: 0 }),
]

describe('CategoryTree', () => {
  test('renders parent and (expanded) subcategory rows', () => {
    render(<CategoryTree items={items} onEdit={() => {}} onAddSubcategory={() => {}} />)
    expect(screen.getByText('Food')).toBeTruthy()
    expect(screen.getByText('Groceries')).toBeTruthy() // child visible (default expanded)
    expect(screen.getByText('Salary')).toBeTruthy()
  })

  test('parent ⋮ menu offers Edit + Add subcategory only (no Archive/Delete in 3.1)', () => {
    const onEdit = vi.fn()
    const onAddSub = vi.fn()
    render(<CategoryTree items={items} onEdit={onEdit} onAddSubcategory={onAddSub} />)

    fireEvent.click(screen.getByLabelText('Actions for Food'))

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Add subcategory' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(items[0])
  })

  test('collapsing a parent hides its children', () => {
    render(<CategoryTree items={items} onEdit={() => {}} onAddSubcategory={() => {}} />)
    expect(screen.getByText('Groceries')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Collapse Food'))
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  test('rows carry no 4px left accent bar element', () => {
    const { container } = render(
      <CategoryTree items={items} onEdit={() => {}} onAddSubcategory={() => {}} />,
    )
    // The retired left-accent-bar pattern would be a w-1/border-l element; assert none exists.
    expect(container.querySelector('.border-l-4')).toBeNull()
    expect(container.querySelectorAll('[data-testid="category-tree-row"]').length).toBe(3)
  })
})
