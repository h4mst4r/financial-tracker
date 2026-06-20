import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Wallet } from 'lucide-react'
import { EntityPage } from '../src/components/entity'

// Minimal valid props for a populated EntityPage (controlled scaffold — no Query/router).
function baseProps() {
  return {
    title: 'Accounts',
    info: '5 accounts',
    newLabel: 'account',
    onNew: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    view: 'grid' as const,
    onViewChange: vi.fn(),
    showArchived: false,
    onShowArchivedChange: vi.fn(),
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    isEmpty: false,
    emptyIcon: Wallet,
    emptyTitle: 'No accounts yet',
  }
}

describe('EntityPage — toolbar', () => {
  test('renders title, info, and the + New button', () => {
    render(
      <EntityPage {...baseProps()}>
        <div>child</div>
      </EntityPage>,
    )
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByText('5 accounts')).toBeInTheDocument()
    expect(screen.getByTestId('entity-page-new')).toBeInTheDocument()
  })

  test('the toolbar + New button calls onNew', () => {
    const props = baseProps()
    render(
      <EntityPage {...props}>
        <div>child</div>
      </EntityPage>,
    )
    fireEvent.click(screen.getByTestId('entity-page-new'))
    expect(props.onNew).toHaveBeenCalled()
  })
})

describe('EntityPage — data states', () => {
  test('loading → skeletons, not children', () => {
    render(
      <EntityPage {...baseProps()} isLoading>
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.queryByText('child-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('entity-page-loading')).toBeInTheDocument()
  })

  test('error → Retry calls onRetry', () => {
    const props = baseProps()
    render(
      <EntityPage {...props} isError>
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.queryByText('child-content')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  test('empty → EmptyState title + New action', () => {
    const props = baseProps()
    render(
      <EntityPage {...props} isEmpty emptyTitle="No accounts yet">
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.queryByText('child-content')).not.toBeInTheDocument()
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
    // toolbar New (testid) + the EmptyState action both present; the empty action is the extra one.
    const newButtons = screen.getAllByRole('button', { name: /new account/i })
    expect(newButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(newButtons[newButtons.length - 1])
    expect(props.onNew).toHaveBeenCalled()
  })

  test('emptyAction overrides the default "+ New" empty-state action', () => {
    const props = baseProps()
    render(
      <EntityPage
        {...props}
        isEmpty
        emptyTitle="No accounts yet"
        emptyAction={<button type="button">Create defaults</button>}
      >
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.getByRole('button', { name: 'Create defaults' })).toBeInTheDocument()
    // Only the toolbar New remains (the EmptyState's default New is replaced by emptyAction).
    expect(screen.getAllByRole('button', { name: /new account/i })).toHaveLength(1)
  })

  test('populated → renders children and a ghost "+ New" tile that calls onNew', () => {
    const props = baseProps()
    render(
      <EntityPage {...props}>
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.getByText('child-content')).toBeInTheDocument()
    const ghost = screen.getByTestId('entity-page-ghost-tile')
    expect(ghost).toBeInTheDocument()
    fireEvent.click(ghost)
    expect(props.onNew).toHaveBeenCalled()
  })

  test('list view → no ghost tile (grid-only affordance)', () => {
    render(
      <EntityPage {...baseProps()} view="list">
        <div>child-content</div>
      </EntityPage>,
    )
    expect(screen.getByText('child-content')).toBeInTheDocument()
    expect(screen.queryByTestId('entity-page-ghost-tile')).not.toBeInTheDocument()
  })
})
