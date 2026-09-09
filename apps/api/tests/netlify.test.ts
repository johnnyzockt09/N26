import { beforeAll, describe, expect, it } from 'vitest';
import { makeHandler, NetlifyEvent, NetlifyResponse } from '../src/netlify';

let handler: (e: NetlifyEvent) => Promise<NetlifyResponse>;

function event(partial: Partial<NetlifyEvent> & { method?: string }): NetlifyEvent {
  return {
    httpMethod: partial.method ?? 'GET',
    rawUrl: partial.rawUrl ?? 'http://localhost/api/status',
    headers: partial.headers ?? {},
    body: partial.body ?? null,
    isBase64Encoded: partial.isBase64Encoded ?? false,
  };
}

function postJson(path: string, body: unknown, extraHeaders?: Record<string, string>): NetlifyEvent {
  return event({
    method: 'POST',
    rawUrl: `http://localhost${path}`,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  handler = await makeHandler('sqlite::memory:');
});

describe('Netlify Functions adapter (fastify.inject)', () => {
  it('serves /api/status and /api/health through the function', async () => {
    const status = await handler(event({ rawUrl: 'http://localhost/api/status' }));
    expect(status.statusCode).toBe(200);
    const payload = JSON.parse(status.body);
    expect(payload.success).toBe(true);
    expect(payload.data.database).toBe('ONLINE');

    const health = await handler(event({ rawUrl: 'http://localhost/api/health' }));
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).status).toBe('ok');
  });

  it('supports a full register -> login -> authed request round trip with cookies', async () => {
    const username = 'netlify_user';
    const reg = await handler(
      postJson('/api/auth/register', { username, email: 'netlify@te.st', password: 'NetlifyTest!123' }),
    );
    expect(reg.statusCode).toBe(201);

    const login = await handler(
      postJson('/api/auth/login', { identifier: username, password: 'NetlifyTest!123' }),
    );
    expect(login.statusCode).toBe(200);
    const loginBody = JSON.parse(login.body);
    expect(loginBody.data.csrfToken).toBeTruthy();

    const setCookies = login.multiValueHeaders?.['set-cookie'] ?? login.headers?.['set-cookie'];
    expect(Array.isArray(setCookies) ? setCookies.length : Boolean(setCookies)).toBeTruthy();

    // Use the session cookie + CSRF token for a protected, state-changing call.
    const cookieHeader = (Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies))
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('n26_session='));
    expect(cookieHeader).toBeTruthy();

    const me = await handler(
      event({
        rawUrl: 'http://localhost/api/auth/me',
        headers: { cookie: cookieHeader ?? '' },
      }),
    );
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).data.username).toBe(username);

    const submit = await handler(
      event({
        method: 'POST',
        rawUrl: 'http://localhost/api/game/levels/1/submit',
        headers: { 'content-type': 'application/json', cookie: cookieHeader ?? '', 'x-csrf-token': loginBody.data.csrfToken },
        body: JSON.stringify({ answer: 'session' }),
      }),
    );
    expect(submit.statusCode).toBe(200);
    expect(JSON.parse(submit.body).data.solved).toBe(true);
  });

  it('rejects unauthenticated protected routes with 401', async () => {
    const res = await handler(event({ rawUrl: 'http://localhost/api/game/levels' }));
    expect(res.statusCode).toBe(401);
  });

  it('maps 404 routes through the adapter', async () => {
    const res = await handler(event({ rawUrl: 'http://localhost/api/nope' }));
    expect(res.statusCode).toBe(404);
  });
});