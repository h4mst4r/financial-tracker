import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
const archive = vi.fn(async () => {})
const restore = vi.fn(async () => {})
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
    archive,
    restore,
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
  archive.mockClear()
  restore.mockClear()
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

  // ── Story 3.4: bulk multi-select + merge ──

  const selectRow = (name: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }))

  test('selecting a row reveals the categories BulkActionBar action set', () => {
    renderPage()
    expect(screen.queryByTestId('bulk-action-bar')).toBeNull()
    selectRow('Food')
    expect(screen.getByTestId('bulk-action-bar')).toBeTruthy()
    for (const id of ['edit-type', 'promote', 'move', 'archive', 'merge']) {
      expect(screen.getByTestId(`bulk-action-${id}`)).toBeTruthy()
    }
  })

  test('Promote/Move are greyed unless every selected row is a subcategory', () => {
    // Page items are two top-levels → Promote/Move disabled.
    renderPage()
    selectRow('Food')
    expect((screen.getByTestId('bulk-action-promote') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('bulk-action-move') as HTMLButtonElement).disabled).toBe(true)
  })

  test('Promote is enabled when only subcategories are selected', () => {
    mockItems = [cat({ id: 'p1', name: 'Food' }), cat({ id: 'c1', name: 'Dining', parent_id: 'p1', depth: 1 })]
    renderPage()
    selectRow('Dining')
    expect((screen.getByTestId('bulk-action-promote') as HTMLButtonElement).disabled).toBe(false)
  })

  test('Merge is greyed below 2 selected, then merges into the chosen target', async () => {
    renderPage()
    selectRow('Food')
    expect((screen.getByTestId('bulk-action-merge') as HTMLButtonElement).disabled).toBe(true)

    selectRow('Salary')
    expect((screen.getByTestId('bulk-action-merge') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('bulk-action-merge'))

    // Chooser modal: pick the surviving target (Salary), then confirm. The Dropdown trigger's
    // accessible name comes from its associated <Label> ("Merge into").
    expect(screen.getByRole('heading', { name: 'Merge categories' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Merge into' }))
    fireEvent.click(screen.getByRole('option', { name: /Salary/ }))
    fireEvent.click(screen.getByRole('button', { name: /Merge 2 categories/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/categories/merge', {
        source_ids: ['p1'],
        target_id: 'p2',
      }),
    )
  })

  test('bulk Archive confirms once, then archives each selected category', async () => {
    renderPage()
    selectRow('Food')
    selectRow('Salary')
    fireEvent.click(screen.getByTestId('bulk-action-archive'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Archive 2 categories/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(archive).toHaveBeenCalledWith('p1'))
    expect(archive).toHaveBeenCalledWith('p2')
  })

  test('bulk Edit type updates each selected category', async () => {
    renderPage()
    selectRow('Food')
    fireEvent.click(screen.getByTestId('bulk-action-edit-type'))

    expect(screen.getByRole('heading', { name: 'Edit type' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Income' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('p1', { category_type: 'income' }))
  })
})
