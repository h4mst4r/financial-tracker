import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Categories } from '../src/pages/Categories'
import type { Category } from '../src/types/category'
import { api } from '../src/api/client'

const cat = (over: Partial<Category>): Category => ({
  id: 'x', status: 'active', name: 'X', color: '#3b82f6', icon: null,
  category_type: 'expense', parent_id: null, depth: 0, vivid: false,
  can_delete: true, delete_blocked_reason: null, ...over,
})

const items: Category[] = [
  cat({ id: 'p1', name: 'Food', icon: '🍔' }),
  cat({ id: 'p2', name: 'Salary', category_type: 'income' }),
]

// Mutable so a test can drive the empty (zero-active) state.
let mockItems: Category[] = items

const create = vi.fn(async (data: unknown) => {
  void data
  return cat({ id: 'new' })
})
const update = vi.fn(async (id: string, data: unknown) => {
  void id
  void data
  return cat({ id: 'p1' })
})
const deletePermanently = vi.fn(async () => {})
const refetch = vi.fn()

vi.mock('../src/hooks/useEntityManager', () => ({
  useEntityManager: () => ({
    items: mockItems,
    total: mockItems.length,
    isLoading: false,
    isError: false,
    error: null,
    refetch,
    showArchived: false,
    setShowArchived: vi.fn(),
    create,
    update,
    archive: vi.fn(),
    restore: vi.fn(),
    deletePermanently,
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
  mockItems = items
  create.mockClear()
  update.mockClear()
  deletePermanently.mockClear()
  refetch.mockClear()
  vi.spyOn(api, 'post').mockResolvedValue({ data: {}, status: 200 })
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

  test('Delete from ⋮ opens the confirm dialog, then calls deletePermanently', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Actions for Salary'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    // Confirm dialog now open (menu closed) — confirm the destructive action.
    expect(screen.getByText(/Permanently delete "Salary"/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deletePermanently).toHaveBeenCalledWith('p2'))
  })

  // ── Story 3.3: Create-defaults empty state (FR-C-007) ──

  test('empty state shows the Create defaults prompt + a chip preview', () => {
    mockItems = []
    renderPage()
    expect(screen.getByRole('button', { name: 'Create defaults' })).toBeTruthy()
    // The secondary New-category action also appears (exact name — the toolbar's is "+ New category").
    expect(screen.getByRole('button', { name: 'New category' })).toBeTruthy()
    // Chip preview mirrors the seed (income chip present).
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.getByText('Food & Dining')).toBeTruthy()
  })

  test('Create defaults posts to the defaults endpoint then refetches', async () => {
    mockItems = []
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Create defaults' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/categories/defaults'))
    expect(refetch).toHaveBeenCalled()
  })
})
