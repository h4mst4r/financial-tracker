import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { Mail } from 'lucide-react'
import { PublicPage } from '../src/components/PublicPage'
import { PublicError } from '../src/pages/public/PublicError'
import { PUBLIC_PAGE_STATES } from '../src/pages/public/publicPages'

describe('PublicPage shell (UX §3)', () => {
  it('renders the icon circle, title, subtitle and action', () => {
    render(
      <PublicPage
        icon={Mail}
        tone="warning"
        title="Not invited"
        subtitle="No household yet."
        action={<button>Sign in</button>}
      />,
    )
    expect(screen.getByTestId('public-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
    expect(screen.getByText('No household yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('PublicError states (bible §3 copy)', () => {
  it.each(['not_invited', 'access_denied', 'not_found', 'household_deleted', 'removed', 'maintenance', 'invalid_invitation'] as const)(
    'renders %s with its bible title',
    (state) => {
      render(
        <MemoryRouter>
          <PublicError state={state} />
        </MemoryRouter>,
      )
      expect(screen.getByRole('heading', { name: PUBLIC_PAGE_STATES[state].title })).toBeInTheDocument()
    },
  )

  it('renders the branded Spinner for the loading state', () => {
    render(
      <MemoryRouter>
        <PublicError state="loading" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
