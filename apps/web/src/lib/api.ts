export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

let csrfToken: string | null = null;

/**
 * Backend base URL. On Netlify this is set via VITE_API_URL to the public
 * HTTPS backend (e.g. https://api.n26.minigamesv2.de). Unset in local dev:
 * relative /api calls are then served by the Vite proxy.
 */
function apiBase(): string {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
}

function resolveUrl(url: string): string {
  const base = apiBase();
  if (!base) return url;
  return base + (url.startsWith('/') ? url : `/${url}`);
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  const fullUrl = resolveUrl(url);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(fullUrl, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    payload = null;
  }

  if (res.status === 401 && !url.endsWith('/api/auth/me')) {
    // Session expired
    setCsrfToken(null);
  }

  if (!res.ok && payload?.error?.code === 'CSRF_INVALID') {
    throw new CsrfError(payload.error.message);
  }

  return payload ?? { success: res.ok, error: { code: 'HTTP_ERROR', message: `HTTP ${res.status}` } };
}

export class CsrfError extends Error {}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};