import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

const webDist = fileURLToPath(new URL('../../../apps/web/dist', import.meta.url));
const hasWeb = existsSync(webDist);

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

describe('single-origin static serving (Variante C)', () => {
  it('serves the built frontend at / (SPA)', { skip: !hasWeb }, async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<div id="root"');
  });

  it('falls back to index.html for client-side routes', { skip: !hasWeb }, async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('keeps /api/* 404 as JSON, not HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(Object.keys(JSON.parse(res.body))).toContain('error');
  });
});