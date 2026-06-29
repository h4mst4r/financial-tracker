import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Wallet } from 'lucide-react'
import { EntityPage } from '../src/components/entity'
import { AlertBanner } from '../src/components/primitives/AlertBanner'
import { ERROR_STATE } from '../src/config/emptyStateRegistry'

// Part II · L19 — Data-surface states: every data surface declares loading / empty / error / stale (owner:
// integration test). EntityPage is the generic record-list scaffold (Accounts/Categories/… consume it), so
// asserting it renders the correct surface for each store state proves the state set is DECLARED, not
// freestyled — a regression that drops one state (e.g. silently renders nothing while loading) fails here.
// `stale` is the §18 AlertBanner surface (5f-6), so it's asserted via the real primitive.

function baseProps() {
  return {
    title: 'Accounts',
    info: '',
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

describe('Part II · L19 — the generic data surface declares every state', () => {
  it('loading → Skeleton grid', () => {
    render(
      <EntityPage {...baseProps()} isLoading>
        <div>row</div>
      </EntityPage>,
    )
    expect(screen.getByTestId('entity-page-loading')).toBeInTheDocument()
  })

  it('error → the §18 error registry copy + a Retry control', () => {
    render(
      <EntityPage {...baseProps()} isError>
        <div>row</div>
      </EntityPage>,
    )
    expect(screen.getByText(ERROR_STATE.title)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('empty → the EmptyState with its registry-driven copy', () => {
    render(
      <EntityPage {...baseProps()} isEmpty>
        <div>row</div>
      </EntityPage>,
    )
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })

  it('populated → the rows render', () => {
    render(
      <EntityPage {...baseProps()}>
        <div>row</div>
      </EntityPage>,
    )
    expect(screen.getByText('row')).toBeInTheDocument()
  })

  it('stale → the §18 AlertBanner surface (warning tone) renders its message', () => {
    render(<AlertBanner tone="warning">Exchange rates may be out of date</AlertBanner>)
    expect(screen.getByText('Exchange rates may be out of date')).toBeInTheDocument()
  })
})
