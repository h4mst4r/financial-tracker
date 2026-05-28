/**
 * Tests for api/client.ts — ApiError class and apiClient function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  apiClient,
  api,
  setAuthStoreGetter,
} from './client';

// --- Mock fetch ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// --- Mock window.location ---

const originalLocation = window.location;

function mockLocation(href: string) {
  Object.defineProperty(window, 'location', {
    value: { href },
    writable: true,
    configurable: true,
  });
}

// --- Helpers ---

function jsonOk(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function jsonError(status: number, body?: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body ?? { error: 'test error' }),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function textOk(text: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/plain' }),
    text: () => Promise.resolve(text),
  });
}

// --- Setup / Teardown ---

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation('http://localhost:3000/dashboard');
});

afterEach(() => {
  // Reset auth store getter
  setAuthStoreGetter(() => ({ csrfToken: null, clearAuth: () => {} }));
});

// --- Tests ---

describe('ApiError', () => {
  it('extends Error and has correct name', () => {
    const error = new ApiError(500, '/api/test');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
  });

  it('stores status code', () => {
    const error = new ApiError(404, '/api/users/123');
    expect(error.status).toBe(404);
  });

  it('stores endpoint', () => {
    const error = new ApiError(500, '/api/accounts');
    expect(error.endpoint).toBe('/api/accounts');
  });

  it('has a default message with status and endpoint', () => {
    const error = new ApiError(403, '/api/admin');
    expect(error.message).toContain('403');
    expect(error.message).toContain('/api/admin');
  });

  it('accepts custom message', () => {
    const error = new ApiError(401, '/api/me', 'Session expired');
    expect(error.message).toBe('Session expired');
  });

  it('stores optional details', () => {
    const details = { field: 'email', code: 'unique' };
    const error = new ApiError(422, '/api/users', null, details);
    expect(error.details).toEqual(details);
  });
});

describe('apiClient', () => {
  describe('GET requests', () => {
    it('returns parsed JSON on success', async () => {
      const testData = { items: [{ id: '1' }], total: 1 };
      mockFetch.mockResolvedValueOnce(jsonOk(testData));

      const result = await apiClient({ method: 'GET', url: '/api/accounts' });

      expect(result.data).toEqual(testData);
      expect(result.status).toBe(200);
    });

    it('passes search params as query string', async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await apiClient({
        method: 'GET',
        url: '/api/accounts',
        searchParams: { page: 1, limit: 10 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/accounts?page=1&limit=10',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('skips undefined search params', async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await apiClient({
        method: 'GET',
        url: '/api/accounts',
        searchParams: { page: 1, limit: undefined as any },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/accounts?page=1',
        expect.any(Object),
      );
    });
  });

  describe('POST requests', () => {
    it('sends JSON body', async () => {
      mockFetch.mockResolvedValueOnce(jsonOk({ id: 'new-1' }));

      await apiClient({
        method: 'POST',
        url: '/api/accounts',
        body: { name: 'Test Account', type: 'bank' },
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
      // Body should be JSON stringified
      const parsedBody = JSON.parse(callArgs[1].body as string);
      expect(parsedBody).toEqual({ name: 'Test Account', type: 'bank' });
    });
  });

  describe('CSRF token', () => {
    it('includes X-CSRF-Token from authStore', async () => {
      setAuthStoreGetter(() => ({ csrfToken: 'test-token-123', clearAuth: () => {} }));
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await apiClient({ method: 'POST', url: '/api/accounts' });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-CSRF-Token']).toBe('test-token-123');
    });

    it('skips CSRF when skipCsrf is true', async () => {
      setAuthStoreGetter(() => ({ csrfToken: 'test-token-123', clearAuth: () => {} }));
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await apiClient({
        method: 'POST',
        url: '/api/auth/login',
        skipCsrf: true,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-CSRF-Token']).toBeUndefined();
    });

    it('does not include CSRF when token is null', async () => {
      setAuthStoreGetter(() => ({ csrfToken: null, clearAuth: () => {} }));
      mockFetch.mockResolvedValueOnce(jsonOk({}));

      await apiClient({ method: 'POST', url: '/api/accounts' });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  describe('401 handling', () => {
    it('calls clearAuth and redirects to /login', async () => {
      let cleared = false;
      setAuthStoreGetter(() => ({
        csrfToken: 'old-token',
        clearAuth: () => { cleared = true; },
      }));

      mockFetch.mockResolvedValueOnce(jsonError(401));

      await expect(
        apiClient({ method: 'GET', url: '/api/accounts' }),
      ).rejects.toThrow(ApiError);

      expect(cleared).toBe(true);
      expect(window.location.href).toBe('/login');
    });

    it('throws ApiError with 401 status', async () => {
      setAuthStoreGetter(() => ({ csrfToken: 'token', clearAuth: () => {} }));
      mockFetch.mockResolvedValueOnce(jsonError(401));

      await expect(
        apiClient({ method: 'GET', url: '/api/accounts' }),
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('error handling', () => {
    it('throws ApiError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce(jsonError(500));

      try {
        await apiClient({ method: 'GET', url: '/api/accounts' });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).endpoint).toBe('/api/accounts');
      }
    });

    it('includes error details in ApiError', async () => {
      const errorBody = { message: 'Database unavailable', code: 'DB_ERROR' };
      mockFetch.mockResolvedValueOnce(jsonError(503, errorBody));

      try {
        await apiClient({ method: 'GET', url: '/api/accounts' });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as ApiError).details).toEqual(errorBody);
      }
    });

    it('handles non-JSON error response', async () => {
      const mockResp = Promise.resolve({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers(),
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('Bad Gateway'),
      });
      mockFetch.mockResolvedValueOnce(mockResp);

      try {
        await apiClient({ method: 'GET', url: '/api/accounts' });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(502);
      }
    });
  });

  describe('text responses', () => {
    it('returns text for non-JSON content type', async () => {
      mockFetch.mockResolvedValueOnce(textOk('Hello World'));

      const result = await apiClient({ method: 'GET', url: '/api/health' });

      expect(result.data).toBe('Hello World');
    });
  });
});

describe('api convenience methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('api.get passes correct method', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({}));

    await api.get('/api/accounts');

    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
  });

  it('api.post passes correct method and body', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({}));

    await api.post('/api/accounts', { name: 'test' });

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('api.put passes correct method', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({}));

    await api.put('/api/accounts/1', { name: 'updated' });

    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  it('api.patch passes correct method', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({}));

    await api.patch('/api/accounts/1', { status: 'archived' });

    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
  });

  it('api.delete passes correct method', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({}));

    await api.delete('/api/accounts/1');

    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});
