import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Categories } from '../src/pages/Categories'
import type { Category } from '../src/types/category'

const cat = (over: Partial<Category>): Category => ({
  id: 'x', status: 'active', name: 'X', color: '#3b82f6', icon: null,
  category_type: 'expense', parent_id: null, depth: 0, vivid: false, ...over,
})

const items: Category[] = [
  cat({ id: 'p1', name: 'Food', icon: '🍔' }),
  cat({ id: 'p2', name: 'Salary', category_type: 'income' }),
]

const create = vi.fn(async (data: unknown) => {
  void data
  return cat({ id: 'new' })
})
const update = vi.fn(async (id: string, data: unknown) => {
  void id
  void data
  return cat({ id: 'p1' })
})

vi.mock('../src/hooks/useEntityManager', () => ({
  useEntityManager: () => ({
    items,
    total: items.length,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    showArchived: false,
    setShowArchived: vi.fn(),
    create,
    update,
    archive: vi.fn(),
    restore: vi.fn(),
    deletePermanently: vi.fn(),
    duplicate: vi.fn(),
    detectDuplicate: vi.fn(),
  }),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<Categories />, { wrapper })
}

beforeEach(() => {
  create.mockClear()
  update.mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('Categories page', () => {
  test('renders the tree from the entity manager', () => {
    renderPage()
    expect(screen.getByText('Food')).toBeTruthy()
    expect(screen.getByText('Salary')).toBeTruthy()
  })

  test('type filter narrows to income', () => {
    renderPage()
    // The page filter SegmentedControl has an Income option (distinct from the modal's, which is closed).
    fireEvent.click(screen.getByRole('button', { name: 'Income' }))
    expect(screen.queryByText('Food')).toBeNull()
    expect(screen.getByText('Salary')).toBeTruthy()
  })

  test('New category → fill name → Create calls manager.create', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Groceries'), {
      target: { value: 'Travel' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toMatchObject({ name: 'Travel', category_type: 'expense' })
  })
})
