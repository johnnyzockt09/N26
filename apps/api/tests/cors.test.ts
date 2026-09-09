import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

let app: FastifyInstance;
let closeApp: () => Promise<void>;

beforeAll(async () => {
  const built = await buildApp({ databaseUrl: 'sqlite::memory:' });
  app = built.app;
  closeApp = built.close;
  await app.ready();
});

afterAll(async () => {
  await closeApp();
});

describe('CORS deployment config', () => {
  it('only allows the configured WEB_ORIGIN origin', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const foreign = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard Access-Control-Allow-Origin', async () => {
    const injected = await app.inject({
      method: 'OPTIONS',
      url: '/api/status',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-csrf-token',
      },
    });
    expect(injected.statusCode).toBe(204);
    expect(injected.headers['access-control-allow-origin'] ?? '').not.toBe('*');
  });
});