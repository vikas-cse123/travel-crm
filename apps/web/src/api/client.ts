import { API_PREFIX, type ApiResponse } from '@interscale/shared';

/**
 * Typed fetch wrapper.
 *
 * Three deliberate choices:
 *  - `credentials: 'include'` so the httpOnly session cookie is always sent.
 *    No token is ever read from or written to JS-accessible storage.
 *  - Requests go to a relative `/api` path, proxied by Vite in dev, so the
 *    cookie stays first-party in every environment.
 *  - State-changing requests echo the CSRF cookie back in a header. That
 *    cookie is deliberately readable by JS — the double-submit pattern needs
 *    it, and the token authorises nothing on its own.
 */

/** Error carrying the server's structured failure envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]> | undefined;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    status: number,
    code: string,
    fields?: Record<string, string[]>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

/** Cookie name the server writes the CSRF token to. Mirrors CSRF_COOKIE_NAME. */
const CSRF_COOKIE_NAME = 'interscale_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${encodeURIComponent(name)}=`));
  return match ? decodeURIComponent(match.slice(match.indexOf('=') + 1)) : undefined;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    // Absent before the first session exists (register, login); the server
    // falls back to Origin validation for those.
    if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON response (proxy error, gateway page, empty 204).
    payload = null;
  }

  if (payload === null) {
    throw new ApiError(
      response.ok ? 'The server returned an unreadable response.' : response.statusText,
      response.status,
      'INTERNAL_ERROR',
    );
  }

  if (!payload.success) {
    throw new ApiError(
      payload.error.message,
      response.status,
      payload.error.code,
      payload.error.fields,
      payload.error.requestId,
    );
  }

  return payload.data;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
