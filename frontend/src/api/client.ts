import type { ProblemDetail } from '../types/api'

// ── ApiError ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    message: string,
    public details: ProblemDetail | null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Auth-store getter seam (avoids circular import) ──────────────────────────

export type AuthStoreSlice = {
  csrfToken: string | null
  clearAuth: () => void
}

let getAuthStore: (() => AuthStoreSlice) | null = null

export function setAuthStoreGetter(getter: () => AuthStoreSlice): void {
  getAuthStore = getter
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

// ── Core request function ─────────────────────────────────────────────────────

async function request<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  opts?: { skipCsrf?: boolean },
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {}

  const upperMethod = method.toUpperCase()

  // CSRF token for non-safe methods (unless skipCsrf)
  if (!isSafeMethod(upperMethod) && !opts?.skipCsrf) {
    const token = getAuthStore?.()?.csrfToken
    if (token) headers['X-CSRF-Token'] = token
  }

  // Bodied calls get JSON content type
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  // Dev session fallback (§2.3)
  const devToken = sessionStorage.getItem('dev_session_token')
  if (devToken) {
    headers['X-Session-Token'] = devToken
  }

  const res = await fetch(endpoint, {
    method: upperMethod,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // 401 → clear auth and redirect to /login (avoid loop)
  if (res.status === 401) {
    getAuthStore?.()?.clearAuth()
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    // Short-circuit: return a never-settling promise so callers don't continue
    return new Promise(() => {})
  }

  // Non-OK → parse RFC 7807 body and throw ApiError
  if (!res.ok) {
    let details: ProblemDetail | null = null
    try {
      const ct = res.headers.get('content-type')
      if (ct?.includes('application/json')) {
        details = (await res.json()) as ProblemDetail
      }
    } catch {
      // Non-JSON or empty body — details stays null
    }
    throw new ApiError(
      res.status,
      endpoint,
      details?.title ?? res.statusText,
      details,
    )
  }

  // 204 or empty body → data: null
  if (res.status === 204) {
    return { data: null as T, status: res.status }
  }

  const data = (await res.json()) as T
  return { data, status: res.status }
}

// ── Convenience verbs ─────────────────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string) => request<T>('GET', endpoint),
  post: <T>(endpoint: string, body?: unknown, opts?: { skipCsrf?: boolean }) =>
    request<T>('POST', endpoint, body, opts),
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>('PUT', endpoint, body),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>('PATCH', endpoint, body),
  delete: <T>(endpoint: string) => request<T>('DELETE', endpoint),
}
