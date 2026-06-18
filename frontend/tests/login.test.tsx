import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Login } from '../src/pages/Login'
import { branding } from '../src/config/branding'

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderLogin(props: { oauthError?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<Login {...props} />, { wrapper })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  fetchMock = vi.fn().mockResolvedValue(makeResponse({ authBypassEnabled: false }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Login page (UX §4.1)', () => {
  it('shows the branding wordmark, mark and Continue with Google', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: branding.wordmark })).toBeInTheDocument()
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('hides the dev-login control when the backend reports bypass off', async () => {
    fetchMock.mockResolvedValue(makeResponse({ authBypassEnabled: false }))
    renderLogin()
    // Give the /auth/config query a tick to resolve; the control must still be absent.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Dev login' })).not.toBeInTheDocument()
    expect(screen.queryByText('DEV BYPASS ON')).not.toBeInTheDocument()
  })

  it('shows the dev-login control only when the backend reports bypass on', async () => {
    fetchMock.mockResolvedValue(makeResponse({ authBypassEnabled: true }))
    renderLogin()
    expect(await screen.findByRole('button', { name: 'Dev login' })).toBeInTheDocument()
    expect(screen.getByText('DEV BYPASS ON')).toBeInTheDocument()
    const [url] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('/auth/config')
  })

  it('shows the calm error banner only when oauthError', () => {
    const { rerender } = renderLogin()
    expect(screen.queryByText(/Sign-in failed/)).not.toBeInTheDocument()
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Login oauthError />
      </QueryClientProvider>,
    )
    expect(screen.getByText(/Sign-in failed/)).toBeInTheDocument()
  })
})
