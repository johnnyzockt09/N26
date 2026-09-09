import { vi } from 'vitest';

export interface MockResponse {
  status: number;
  body: unknown;
}

export type FetchInput = string | { url: string };

export type FetchHandler = (input: FetchInput, init?: RequestInit) => MockResponse | Promise<MockResponse>;

function toResponseLike(mock: MockResponse): globalThis.Response {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  const text = JSON.stringify(mock.body);
  return {
    ok: mock.status >= 200 && mock.status < 300,
    status: mock.status,
    json: async () => JSON.parse(text),
    text: async () => text,
    headers,
  } as unknown as globalThis.Response;
}

export function mockFetch(handler: FetchHandler) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const normalized: FetchInput =
      typeof input === 'string' ? input : input instanceof URL ? input.href : { url: input.url };
    const mock = await handler(normalized, init ?? {});
    return toResponseLike(mock);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export function resetFetch() {
  vi.unstubAllGlobals();
}

/** Route fetch by URL prefix: exact-match GET/POST shapes for the app. */
export function routeByUrl(
  routes: Record<string, MockResponse>,
): FetchHandler {
  return (input) => {
    const url = typeof input === 'string' ? input : input.url;
    for (const [prefix, mock] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return mock;
    }
    return { status: 500, body: { success: false, error: { code: 'NOT_MOCKED', message: `no mock for ${url}` } } };
  };
}

export const mockOk = (data: unknown): MockResponse => ({ status: 200, body: { success: true, data } });

export const mockNoAuth = (): MockResponse => ({ status: 401, body: { success: false, error: { code: 'UNAUTHENTICATED', message: 'Nicht angemeldet' } } });