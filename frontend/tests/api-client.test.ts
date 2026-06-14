import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api, ApiError, setAuthStoreGetter } from '../src/api/client'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(
    body !== null ? JSON.stringify(body) : '',
    { status, headers: { 'content-type': contentType } },
  )
}

function mockLocation(pathname: string) {
  const original = { ...window.location }
  Object.defineProperty(window, 'location', {
    value: { ...original, pathname, href: '' },
    writable: true,
    configurable: true,
  })
  return () => Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
}

/** Extract headers from the fetch mock's last call init (second arg). */
function getFetchHeaders(fetchMock: { mock: { calls: unknown[][] } }): Headers {
  const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined
  const h = init?.headers as Record<string, string> | Headers | undefined
  if (h instanceof Headers) return h
  return new Headers(h as Record<string, string> | undefined)
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let clearAuthMock: ReturnType<typeof vi.fn>
let csrfToken: string | null

beforeEach(() => {
  vi.restoreAllMocks()
  csrfToken = null
  clearAuthMock = vi.fn()

  // Reset auth store getter
  setAuthStoreGetter(() => ({ csrfToken, clearAuth: clearAuthMock }))

  // Clear dev token
  sessionStorage.removeItem('dev_session_token')
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('api/client.ts', () => {
  test('POST injects X-CSRF-Token when auth store has a token', async () => {
    csrfToken = 'test-csrf-token'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ id: 1 }))

    await api.post('/api/test', { name: 'test' })

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('X-CSRF-Token')).toBe('test-csrf-token')
  })

  test('GET does NOT carry X-CSRF-Token', async () => {
    csrfToken = 'test-csrf-token'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ id: 1 }))

    await api.get('/api/test')

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('X-CSRF-Token')).toBeNull()
  })

  test('skipCsrf omits CSRF header on POST', async () => {
    csrfToken = 'test-csrf-token'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ ok: true }))

    await api.post('/api/login', { email: 'a@b.c' }, { skipCsrf: true })

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('X-CSRF-Token')).toBeNull()
  })

  test('401 calls clearAuth and redirects to /login', async () => {
    const restoreLocation = mockLocation('/dashboard')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    // Suppress unhandled rejection from the never-settling promise
    const promise = api.get('/api/test')
    // Abort: prevent unhandled rejection warning
    promise.catch(() => {})

    // Give the redirect a tick to happen
    await new Promise((r) => setTimeout(r, 10))

    expect(clearAuthMock).toHaveBeenCalled()
    expect(window.location.href).toBe('/login')

    restoreLocation()
    vi.restoreAllMocks()
  })

  test('401 does NOT redirect when already on /login', async () => {
    const restoreLocation = mockLocation('/login')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    const promise = api.get('/api/test')
    promise.catch(() => {})

    await new Promise((r) => setTimeout(r, 10))

    expect(clearAuthMock).toHaveBeenCalled()
    expect(window.location.href).toBe('') // not changed

    restoreLocation()
    vi.restoreAllMocks()
  })

  test('409 with RFC 7807 body throws ApiError with details', async () => {
    const problemBody = {
      type: 'duplicate_name',
      title: 'Category already exists',
      status: 409,
      detail: "Category 'Food' already exists",
      instance: '/api/categories',
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse(problemBody, 409))

    let caughtError: ApiError | null = null
    try {
      await api.post('/api/categories', { name: 'Food' })
    } catch (error) {
      caughtError = error as ApiError
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    expect(caughtError!.status).toBe(409)
    expect(caughtError!.details?.type).toBe('duplicate_name')
    expect(caughtError!.details?.title).toBe('Category already exists')
  })

  test('204 resolves with data: null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )

    const result = await api.delete('/api/categories/123')

    expect(result).toEqual({ data: null, status: 204 })
  })

  test('X-Session-Token added when dev_session_token is set', async () => {
    sessionStorage.setItem('dev_session_token', 'dev-token-123')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ ok: true }))

    await api.get('/api/test')

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('X-Session-Token')).toBe('dev-token-123')
  })

  test('credentials: include is set on every request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ ok: true }))

    await api.get('/api/test')

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('include')
  })

  test('PUT sends Content-Type: application/json for bodied calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ id: 1 }))

    await api.put('/api/categories/123', { name: 'Updated' })

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  test('GET without body does NOT send Content-Type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({ id: 1 }))

    await api.get('/api/test')

    const headers = getFetchHeaders(fetchMock)
    expect(headers.get('Content-Type')).toBeNull()
  })

  test('non-JSON error body throws ApiError with details: null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('internal error', { status: 500, headers: { 'content-type': 'text/plain' } }),
    )

    let caughtError: ApiError | null = null
    try {
      await api.get('/api/test')
    } catch (error) {
      caughtError = error as ApiError
    }

    expect(caughtError).toBeInstanceOf(ApiError)
    expect(caughtError!.status).toBe(500)
    expect(caughtError!.details).toBeNull()
  })

  test('successful call returns { data, status }', async () => {
    const body = { id: 1, name: 'test' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse(body, 200))

    const result = await api.get('/api/test')

    expect(result).toEqual({ data: body, status: 200 })
  })
})
