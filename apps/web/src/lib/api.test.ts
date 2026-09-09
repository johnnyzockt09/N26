import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setCsrfToken, getCsrfToken, CsrfError } from './api';
import { mockFetch, resetFetch } from '../test/mockFetch';

beforeEach(() => {
  setCsrfToken(null);
  resetFetch();
});

describe('api helper', () => {
  it('sends credentials with every request', async () => {
    let init: RequestInit | undefined;
    mockFetch((input, i) => {
      init = i;
      return { status: 200, body: { success: true, data: null } };
    });
    await api.get('/api/foo');
    expect(init?.credentials).toBe('include');
  });

  it('adds the CSRF header to state-changing requests with a token', async () => {
    setCsrfToken('csrf-token-abc');
    let init: RequestInit | undefined;
    mockFetch((input, i) => {
      init = i;
      return { status: 200, body: { success: true, data: { ok: true } } };
    });
    await api.post('/api/transfer', { amountCents: 5 });
    expect(init?.headers).toMatchObject({ 'x-csrf-token': 'csrf-token-abc' });
  });

  it('does not send CSRF header on GET', async () => {
    setCsrfToken('csrf-token-abc');
    let init: RequestInit | undefined;
    mockFetch((input, i) => {
      init = i;
      return { status: 200, body: { success: true, data: null } };
    });
    await api.get('/api/levels');
    expect(init?.headers && (init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('clears the CSRF token when the session expires (401 on non-me)', async () => {
    setCsrfToken('old-token');
    expect(getCsrfToken()).toBe('old-token');
    mockFetch(() => ({ status: 401, body: { success: false, error: { code: 'UNAUTHENTICATED' } } }));
    const res = await api.get('/api/account');
    expect(res.success).toBe(false);
    expect(getCsrfToken()).toBeNull();
  });

  it('throws CsrfError when the server rejects the CSRF token', async () => {
    setCsrfToken('stale-token');
    mockFetch(() => ({ status: 403, body: { success: false, error: { code: 'CSRF_INVALID', message: 'CSRF-Token ungültig' } } }));
    await expect(api.post('/api/transfer', {})).rejects.toBeInstanceOf(CsrfError);
  });

  it('unwraps a successful payload', async () => {
    mockFetch(() => ({ status: 200, body: { success: true, data: { value: 42 } } }));
    const res = await api.get<{ value: number }>('/api/whatever');
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
    expect(res.data?.value).toBe(42);
  });

  it('calls the absolute backend URL when VITE_API_URL is configured', async () => {
    const prev = import.meta.env.VITE_API_URL;
    vi.stubEnv('VITE_API_URL', 'https://api.n26.minigamesv2.de');
    let calledUrl: string | undefined;
    mockFetch((input) => {
      calledUrl = typeof input === 'string' ? input : input.url;
      return { status: 200, body: { success: true, data: { ok: true } } };
    });
    await api.get('/api/account');
    expect(calledUrl).toBe('https://api.n26.minigamesv2.de/api/account');
    vi.stubEnv('VITE_API_URL', prev);
  });
});