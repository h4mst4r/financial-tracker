import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EmojiIconPicker } from '../src/components/primitives/EmojiIconPicker'
import { setAuthStoreGetter } from '../src/api/client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  setAuthStoreGetter(() => ({ csrfToken: 'csrf-test', clearAuth: vi.fn() }))
  sessionStorage.removeItem('dev_session_token')
  fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
    if (String(url).endsWith('/api/profile/recent-glyphs') && (opts?.method ?? 'GET') === 'GET') {
      return jsonResponse({ glyphs: ['🚇', '🏠'] })
    }
    return jsonResponse({ glyphs: ['🍔', '🚇', '🏠'] }) // POST push
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderPicker(over: Partial<Parameters<typeof EmojiIconPicker>[0]> = {}) {
  const onChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<EmojiIconPicker value={null} onChange={onChange} {...over} />, { wrapper })
  return { onChange }
}

describe('EmojiIconPicker', () => {
  test('opens with Emojis + Icons tabs and a search field', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /choose an icon/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Emojis')).toBeTruthy()
    expect(screen.getByText('Icons')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
  })

  test('search filters the glyph grid', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /choose an icon/i }))
    expect(screen.getByLabelText('🍔')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'transport' } })
    expect(screen.getByLabelText('🚇')).toBeTruthy()
    expect(screen.queryByLabelText('🍔')).toBeNull()
  })

  test('picking a glyph calls onChange and pushes to recent-glyphs', async () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /choose an icon/i }))
    fireEvent.click(screen.getByLabelText('🍔'))
    expect(onChange).toHaveBeenCalledWith('🍔')
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, o]) =>
            String(u).endsWith('/api/profile/recent-glyphs') && (o as RequestInit)?.method === 'POST',
        ),
      ).toBe(true),
    )
  })

  test('shows the Recent row from recent-glyphs and clears a set glyph', async () => {
    const { onChange } = renderPicker({ value: '🏠' })
    fireEvent.click(screen.getByRole('button', { name: /glyph/i }))
    // Recent row (no label) renders the fetched glyphs in addition to the grid → 🚇 appears twice.
    await waitFor(() => expect(screen.getAllByLabelText('🚇').length).toBeGreaterThan(1))
    fireEvent.click(screen.getByText('Clear glyph'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  test('Icons tab renders lucide glyphs', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /choose an icon/i }))
    fireEvent.click(screen.getByText('Icons'))
    expect(screen.getByLabelText('lucide:house')).toBeTruthy()
  })
})
