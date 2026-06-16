import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEntityManager } from '../src/hooks/useEntityManager'
import { setAuthStoreGetter, ApiError } from '../src/api/client'
import type { BaseEntity } from '../src/types/entity'

// ── Test entity + helpers ───────────────────────────────────────────────────

interface Widget extends BaseEntity {
  name: string
}

function makeResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': contentType },
  })
}

/** Fresh QueryClient per test (no retries so error states resolve immediately). */
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const config = { entityType: 'widgets', basePath: '/api/widgets' }

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

/** URL of the Nth fetch call. */
function urlOf(n: number): string {
  return String(fetchMock.mock.calls[n]![0])
}
/** Method of the Nth fetch call. */
function methodOf(n: number): string {
  return (fetchMock.mock.calls[n]![1] as RequestInit).method!
}

describe('useEntityManager — list query', () => {
  test('fetches GET {basePath} and exposes items/total', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ items: [{ id: '1', status: 'active', name: 'A' }], total: 1 }),
    )
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(urlOf(0)).toBe('/api/widgets')
    expect(methodOf(0)).toBe('GET')
    expect(result.current.items).toEqual([{ id: '1', status: 'active', name: 'A' }])
    expect(result.current.total).toBe(1)
  })

  test('setShowArchived(true) refetches with ?include_archived=true', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setShowArchived(true))

    await waitFor(() => expect(result.current.showArchived).toBe(true))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/widgets?include_archived=true')).toBe(true),
    )
  })

  test('exposes isError on a failed list fetch', async () => {
    fetchMock.mockResolvedValue(makeResponse({ type: 'server_error', title: 'boom', status: 500 }, 500))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useEntityManager — mutations hit the canonical routes', () => {
  test('create → POST {basePath}', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '2', status: 'active', name: 'New' }, 201))
    await act(async () => {
      await result.current.create({ name: 'New' })
    })
    const i = fetchMock.mock.calls.length - 2 // last is the invalidation refetch
    expect(urlOf(i)).toBe('/api/widgets')
    expect(methodOf(i)).toBe('POST')
  })

  test('update → PATCH {basePath}/{id}', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '1', status: 'active', name: 'Edit' }))
    await act(async () => {
      await result.current.update('1', { name: 'Edit' })
    })
    const i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/widgets/1')
    expect(methodOf(i)).toBe('PATCH')
  })

  test('archive / restore → POST {basePath}/{id}/archive|restore', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '1', status: 'archived', name: 'A' }))
    await act(async () => {
      await result.current.archive('1')
    })
    let i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/widgets/1/archive')
    expect(methodOf(i)).toBe('POST')

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '1', status: 'active', name: 'A' }))
    await act(async () => {
      await result.current.restore('1')
    })
    i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/widgets/1/restore')
    expect(methodOf(i)).toBe('POST')
  })

  test('duplicate → POST {basePath}/{id}/duplicate', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '3', status: 'active', name: 'A copy' }, 201))
    await act(async () => {
      await result.current.duplicate('1')
    })
    const i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/widgets/1/duplicate')
    expect(methodOf(i)).toBe('POST')
  })

  test('detectDuplicate → POST {basePath}/detect-duplicate and returns candidates (no refetch)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const before = fetchMock.mock.calls.length

    fetchMock.mockResolvedValueOnce(makeResponse({ candidates: [{ id: '9', status: 'active', name: 'Dup' }] }))
    let out: { candidates: Widget[] } | undefined
    await act(async () => {
      out = await result.current.detectDuplicate({ name: 'Dup' })
    })
    expect(urlOf(before)).toBe('/api/widgets/detect-duplicate')
    expect(methodOf(before)).toBe('POST')
    expect(out!.candidates).toHaveLength(1)
    // detectDuplicate does NOT invalidate the list → no extra refetch after it
    expect(fetchMock.mock.calls.length).toBe(before + 1)
  })

  test('deletePermanently → DELETE {basePath}/{id}; a 409 propagates as ApiError', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // success path (204)
    fetchMock.mockResolvedValueOnce(makeResponse(null, 204))
    await act(async () => {
      await result.current.deletePermanently('1')
    })
    const i = fetchMock.mock.calls.length - 2
    expect(urlOf(i)).toBe('/api/widgets/1')
    expect(methodOf(i)).toBe('DELETE')

    // 409 has_dependencies → must reject, not swallow
    fetchMock.mockResolvedValueOnce(
      makeResponse({ type: 'has_dependencies', title: 'In use', status: 409 }, 409),
    )
    await expect(result.current.deletePermanently('1')).rejects.toBeInstanceOf(ApiError)
  })

  test('a mutation success invalidates the list (triggers a refetch)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ items: [], total: 0 }))
    const { result } = renderHook(() => useEntityManager<Widget>(config), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const listCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/widgets').length

    fetchMock.mockResolvedValueOnce(makeResponse({ id: '2', status: 'active', name: 'New' }, 201))
    await act(async () => {
      await result.current.create({ name: 'New' })
    })
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/widgets').length
      expect(after).toBeGreaterThan(listCallsBefore)
    })
  })
})
