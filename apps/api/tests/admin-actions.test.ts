import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { Database } from '../src/db/database';
import { hashToken, issueCsrfToken } from '../src/lib/security';
import { LinkingService } from '../src/services/linking';
import { RconService } from '../src/services/rcon';

let app: FastifyInstance;
let db: Database;
let closeApp: () => Promise<void>;

beforeAll(async () => {
  const built = await buildApp({ databaseUrl: 'sqlite::memory:' });
  app = built.app;
  db = built.ctx.db;
  closeApp = built.close;
  await app.ready();
});

afterAll(async () => {
  await closeApp();
});

let seq = 0;

async function makeAdminSession() {
  seq += 1;
  const username = `admin_kick_${seq}`;
  const user = await db.users.create({ username, email: `${username}@te.st`, passwordHash: 'x', role: 'admin' });
  const session = await db.sessions.create({
    userId: user.id,
    tokenHash: hashToken(`kick-session-${seq}`),
    ipAddress: null,
    userAgent: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { token: `kick-session-${seq}`, csrf: issueCsrfToken(session.id) };
}

async function makeUserSession(role: 'user' | 'admin' = 'user') {
  seq += 1;
  const username = `kick_user_${seq}`;
  const user = await db.users.create({ username, email: `${username}@te.st`, passwordHash: 'x', role });
  const session = await db.sessions.create({
    userId: user.id,
    tokenHash: hashToken(`kick-user-session-${seq}`),
    ipAddress: null,
    userAgent: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { token: `kick-user-session-${seq}`, csrf: issueCsrfToken(session.id) };
}

function authedAgent(token: string, csrf: string) {
  return {
    get: (url: string) => app.inject({ method: 'GET', url, cookies: { n26_session: token } }),
    post: (url: string, payload?: unknown) =>
      app.inject({ method: 'POST', url, cookies: { n26_session: token }, headers: { 'x-csrf-token': csrf }, payload }),
  };
}

describe('admin kick action', () => {
  it('rejects non-admin users with 403', async () => {
    const { token, csrf } = await makeUserSession('user');
    const res = await authedAgent(token, csrf).post('/api/admin/kick', { username: 'Steve' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects missing or invalid player names with 400', async () => {
    const { token, csrf } = await makeAdminSession();
    const noName = await authedAgent(token, csrf).post('/api/admin/kick', {});
    expect(noName.statusCode).toBe(400);

    const bad = await authedAgent(token, csrf).post('/api/admin/kick', { username: 'Ste ve; say x' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION');
  });

  it('returns SERVER_UNREACHABLE when RCON is not connected (no fake success)', async () => {
    const { token, csrf } = await makeAdminSession();
    const res = await authedAgent(token, csrf).post('/api/admin/kick', { username: 'Steve', reason: 'Test' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('SERVER_UNREACHABLE');
  });
});

describe('auto admin promotion on link', () => {
  it('promotes the web account to admin when the linked MC name is configured', async () => {
    seq += 1;
    const username = `promo_admin_${seq}`;
    const user = await db.users.create({ username, email: `${username}@te.st`, passwordHash: 'x', role: 'user' });
    const code = 'ABCDEF-123456';
    const pinHash = 'deadbeef';
    await db.linkChallenges.create({
      userId: user.id,
      challengeCode: code,
      pinHash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const stubRcon = {
      readLinkEntry: async () => ({ player_uuid: '12345678-1234-1234-8123-123456789abc', player_name: 'Johnnyzockt09' }),
      clearLinkEntry: async () => undefined,
    } as unknown as RconService;

    const service = new LinkingService(db, stubRcon);
    const outcome = await service.checkChallenge(user.id, code);

    expect(outcome.status).toBe('COMPLETED');
    expect((await db.users.findById(user.id))?.role).toBe('admin');
  });

  it('keeps a regular player linked as a normal user', async () => {
    seq += 1;
    const username = `promo_user_${seq}`;
    const user = await db.users.create({ username, email: `${username}@te.st`, passwordHash: 'x', role: 'user' });
    const code = '111111-AAAAAA';
    await db.linkChallenges.create({
      userId: user.id,
      challengeCode: code,
      pinHash: 'deadbeef',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const stubRcon = {
      readLinkEntry: async () => ({ player_uuid: '87654321-4321-4321-8123-123456789abc', player_name: 'Steve' }),
      clearLinkEntry: async () => undefined,
    } as unknown as RconService;

    const service = new LinkingService(db, stubRcon);
    const outcome = await service.checkChallenge(user.id, code);

    expect(outcome.status).toBe('COMPLETED');
    expect((await db.users.findById(user.id))?.role).toBe('user');
  });
});