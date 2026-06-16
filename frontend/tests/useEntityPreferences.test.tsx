import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEntityPreferences } from '../src/hooks/useEntityPreferences'
import { setAuthStoreGetter } from '../src/api/client'

function makeResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': contentType },
  })
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  setAuthStoreGetter(() => ({ csrfToken: 'csrf-test', clearAuth: vi.fn() }))
  sessionStorage.removeItem('dev_session_token')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function urlOf(n: number): string {
  return String(fetchMock.mock.calls[n]![0])
}
function methodOf(n: number): string {
  return (fetchMock.mock.calls[n]![1] as RequestInit).method!
}
function bodyOf(n: number): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[n]![1] as RequestInit).body))
}

describe('useEntityPreferences — list query', () => {
  test('fetches GET /api/entity-preferences?entity_type=… and exposes the Map keyed by entity_id', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        items: [{ entity_type: 'account', entity_id: 'a1', is_favourite: true, sort_order: 0 }],
      }),
    )
    const { result } = renderHook(() => useEntityPreferences('account'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(urlOf(0)).toBe('/api/entity-preferences?entity_type=account')
    expect(methodOf(0)).toBe('GET')
    expect(result.current.preferences.get('a1')?.is_favourite).toBe(true)
  })
})

describe('useEntityPreferences — mutations honour the locked contract', () => {
  test('setFavourite → PUT with { entity_type, entity_id, is_favourite } and NO person_id (FR-E-021)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [] }))
    const { result } = renderHook(() => useEntityPreferences('account'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse(null, 204))
    await act(async () => {
      await result.current.setFavourite('a1', true)
    })
    const i = fetchMock.mock.calls.length - 2 // last call is the invalidation refetch
    expect(urlOf(i)).toBe('/api/entity-preferences')
    expect(methodOf(i)).toBe('PUT')
    const body = bodyOf(i)
    expect(body).toEqual({ entity_type: 'account', entity_id: 'a1', is_favourite: true })
    // The headline FR-E-021 lock: the client must never send person_id (server derives it).
    expect('person_id' in body).toBe(false)
  })

  test('setSortOrder → PUT with { entity_type, entity_id, sort_order }', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [] }))
    const { result } = renderHook(() => useEntityPreferences('account'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse(null, 204))
    await act(async () => {
      await result.current.setSortOrder('a1', 5)
    })
    const i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/entity-preferences')
    expect(bodyOf(i)).toEqual({ entity_type: 'account', entity_id: 'a1', sort_order: 5 })
  })

  test('reorder → PUT /reorder with { entity_type, ordered_ids }', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [] }))
    const { result } = renderHook(() => useEntityPreferences('account'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse(null, 204))
    await act(async () => {
      await result.current.reorder(['a', 'b', 'c'])
    })
    const i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/entity-preferences/reorder')
    expect(methodOf(i)).toBe('PUT')
    expect(bodyOf(i)).toEqual({ entity_type: 'account', ordered_ids: ['a', 'b', 'c'] })
  })

  test('a mutation success invalidates the list (triggers a refetch)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [] }))
    const { result } = renderHook(() => useEntityPreferences('account'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const listCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/entity-preferences?'),
    ).length

    fetchMock.mockResolvedValueOnce(makeResponse(null, 204))
    await act(async () => {
      await result.current.setFavourite('a1', true)
    })
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((c) =>
        String(c[0]).startsWith('/api/entity-preferences?'),
      ).length
      expect(after).toBeGreaterThan(listCallsBefore)
    })
  })
})
