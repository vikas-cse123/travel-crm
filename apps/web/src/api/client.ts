import { API_PREFIX, type ApiResponse } from '@interscale/shared';

/**
 * Typed fetch wrapper.
 *
 * Two deliberate choices:
 *  - `credentials: 'include'` so the httpOnly session cookie is always sent.
 *    No token is ever read from or written to JS-accessible storage.
 *  - Requests go to a relative `/api` path, proxied by Vite in dev, so the
 *    cookie stays first-party in every environment.
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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
