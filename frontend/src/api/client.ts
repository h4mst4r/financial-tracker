/**
 * Base API client wrapper around fetch.
 * - Automatically includes X-CSRF-Token from authStore
 * - Handles 401 → clearAuth + redirect to /login
 * - Throws typed ApiError on non-2xx responses
 *
 * ARCH §3.2 — HTTP client layer
 */

import { useAlertStore } from '../store/alertStore';

// --- Lazy import authStore to avoid circular dependencies ---
// We use a getter function so the store is only accessed when needed.
let getAuthStore: () => { csrfToken: string | null; clearAuth: () => void } | undefined;

export function setAuthStoreGetter(
  getter: () => { csrfToken: string | null; clearAuth: () => void },
): void {
  getAuthStore = getter;
}

// --- ApiError ---

export class ApiError extends Error {
  public readonly status: number;
  public readonly endpoint: string;
  public readonly details?: unknown;

  constructor(status: number, endpoint: string, message?: string, details?: unknown) {
    super(message ?? `API error (${status}) on ${endpoint}`);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.details = details;
  }
}

// --- Request Config ---

export interface ApiRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  searchParams?: Record<string, string | number | boolean>;
  /** Skip CSRF token (useful for login endpoints) */
  skipCsrf?: boolean;
}

// --- Response Shape ---

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

// --- Helper: Build URL with search params ---

function buildUrl(url: string, searchParams?: Record<string, string | number | boolean>): string {
  if (!searchParams || Object.keys(searchParams).length === 0) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params.toString()}`;
}

// --- Main Client ---

export async function apiClient<T = unknown>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
  const { method, url, body, searchParams, skipCsrf } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Attach CSRF token for mutating requests
  if (!skipCsrf && getAuthStore) {
    const authStore = getAuthStore();
    const csrfToken = authStore?.csrfToken ?? null;
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const fullUrl = buildUrl(url, searchParams);

  const response = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — unauthorized
  if (response.status === 401) {
    if (getAuthStore) {
      const authStore = getAuthStore();
      authStore?.clearAuth();
    }
    // Hard redirect to ensure clean state
    window.location.href = '/login';
    throw new ApiError(401, url, 'Unauthorized — session expired');
  }

  // Handle non-2xx responses
  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = response.statusText;
    }
    throw new ApiError(response.status, url, `Request failed with status ${response.status}`, details);
  }

  // Parse successful response
  let data: T;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = (await response.text()) as T;
  }

  return { data, status: response.status };
}

// --- Convenience Methods ---

export const api = {
  get: <T = unknown>(url: string, searchParams?: Record<string, string | number | boolean>) =>
    apiClient<T>({ method: 'GET', url, searchParams }),

  post: <T = unknown>(url: string, body?: unknown) =>
    apiClient<T>({ method: 'POST', url, body }),

  put: <T = unknown>(url: string, body?: unknown) =>
    apiClient<T>({ method: 'PUT', url, body }),

  patch: <T = unknown>(url: string, body?: unknown) =>
    apiClient<T>({ method: 'PATCH', url, body }),

  delete: <T = unknown>(url: string) =>
    apiClient<T>({ method: 'DELETE', url }),
};
