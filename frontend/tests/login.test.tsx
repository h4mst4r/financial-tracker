import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Login } from '../src/pages/Login'
import { branding } from '../src/config/branding'

describe('Login page (UX §4.1)', () => {
  it('shows the branding wordmark, mark and Continue with Google', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { name: branding.wordmark })).toBeInTheDocument()
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('shows the dev bypass controls (import.meta.env.DEV)', () => {
    render(<Login />)
    expect(screen.getByRole('button', { name: 'Dev login' })).toBeInTheDocument()
    expect(screen.getByText('DEV BYPASS ON')).toBeInTheDocument()
  })

  it('shows the calm error banner only when oauthError', () => {
    const { rerender } = render(<Login />)
    expect(screen.queryByText(/Sign-in failed/)).not.toBeInTheDocument()
    rerender(<Login oauthError />)
    expect(screen.getByText(/Sign-in failed/)).toBeInTheDocument()
  })
})
