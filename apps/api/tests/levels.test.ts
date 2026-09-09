import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { Database } from '../src/db/database';
import { hashToken, issueCsrfToken } from '../src/lib/security';

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

async function registerAndLogin(username: string) {
  const email = `${username}@te.st`;
  const password = 'LevelTest!123';
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, email, password },
  });
  expect(reg.statusCode).toBe(201);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identifier: username, password },
  });
  expect(login.statusCode).toBe(200);
  const body = login.json();
  const token = login.cookies.find((c) => c.name === 'n26_session')!.value;
  return { token, csrf: body.data.csrfToken };
}

function postAuthed(url: string, token: string, csrf: string, payload?: unknown) {
  return app.inject({
    method: 'POST',
    url,
    cookies: { n26_session: token },
    headers: { 'x-csrf-token': csrf },
    payload,
  });
}

function getAuthed(url: string, token: string) {
  return app.inject({ method: 'GET', url, cookies: { n26_session: token } });
}

describe('Level campaign', () => {
  it('seeds 20 active levels', async () => {
    const { token } = await registerAndLogin('player_seed');
    const res = await getAuthed('/api/game/levels', token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.levels).toHaveLength(20);
  });

  it('requires authentication', async () => {
    const res = await getAuthed('/api/game/levels', 'no-cookie');
    expect(res.statusCode).toBe(401);
  });

  it('unlocks only the first level initially', async () => {
    const { token } = await registerAndLogin('player_unlock');
    const res = await getAuthed('/api/game/levels', token);
    const levels = res.json().data.levels as { unlocked: boolean; solved: boolean }[];
    expect(levels[0].unlocked).toBe(true);
    expect(levels[1].unlocked).toBe(false);
    expect(levels[levels.length - 1].unlocked).toBe(false);
  });

  it('does not leak answers in any player response', async () => {
    const { token } = await registerAndLogin('player_noleak');
    const list = await getAuthed('/api/game/levels', token);
    const rawList = JSON.stringify(list.json());
    expect(rawList).not.toContain('answers');
    expect(rawList).not.toContain('Session');
    expect(rawList).not.toContain('FRJVAQ');

    const level = await getAuthed('/api/game/levels/1', token);
    const body = level.json();
    expect(body.data.answers).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('Session');
    // The ROT13 ciphertext is the public clue, but its plaintext must never appear.
    expect(body.data.body.text).toContain('FRJVAQ');
  });

  it('rejects a locked level', async () => {
    const { token } = await registerAndLogin('player_locked');
    const res = await getAuthed('/api/game/levels/2', token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('LEVEL_LOCKED');
  });

  it('returns 404 for unknown levels', async () => {
    const { token } = await registerAndLogin('player_404');
    const res = await getAuthed('/api/game/levels/9999', token);
    expect(res.statusCode).toBe(404);
  });

  it('accepts a correct answer and reveals the story', async () => {
    const { token, csrf } = await registerAndLogin('player_solve');
    const res = await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'Session' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.solved).toBe(true);
    expect(data.alreadySolved).toBe(false);
    expect(data.storyReveal).toBe('SERVER STATUS: UNKNOWN');
    expect(data.nextLevelId).toBe(2);
  });

  it('normalizes answer input (case/punctuation/whitespace)', async () => {
    const { token, csrf } = await registerAndLogin('player_norm');
    // "tuokcalb" from level 2 = "blackout"; submit with mixed spacing.
    await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'session' });
    const res = await postAuthed('/api/game/levels/2/submit', token, csrf, { answer: ' b-l-a-c-k-o-u-t! ' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.solved).toBe(true);
  });

  it('counts wrong attempts and refuses already-solved repeats writing progres', async () => {
    const { token, csrf } = await registerAndLogin('player_attempts');
    await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'Wrong' });
    await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'falsch' });
    const solved = await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'Session' });
    expect(solved.json().data.solved).toBe(true);

    const again = await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'session' });
    expect(again.json().data.alreadySolved).toBe(true);

    const levels = (await getAuthed('/api/game/levels', token)).json().data.levels as { title: string; attempts: number }[];
    expect(levels[0].attempts).toBe(3);
  });

  it('rejects invalid answer formats', async () => {
    const { token, csrf } = await registerAndLogin('player_invalid');
    const bad = await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: { nope: true } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVALID_ANSWER');
    const long = await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'x'.repeat(500) });
    expect(long.statusCode).toBe(400);
  });

  it('releases hints one at a time and tracks usage', async () => {
    const { token, csrf } = await registerAndLogin('player_hints');
    await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'Session' });
    await postAuthed('/api/game/levels/2/submit', token, csrf, { answer: 'Blackout' });

    const before = await getAuthed('/api/game/levels/2', token);
    expect(before.json().data.hints).toHaveLength(0);

    const first = await postAuthed('/api/game/levels/2/hints', token, csrf);
    expect(first.statusCode).toBe(200);
    expect(first.json().data.remaining).toBe(2);
    expect(typeof first.json().data.hint.text).toBe('string');

    const second = await postAuthed('/api/game/levels/2/hints', token, csrf);
    expect(second.json().data.remaining).toBe(1);

    const after = await getAuthed('/api/game/levels/2', token);
    expect(after.json().data.hints).toHaveLength(2);
    expect(after.json().data.hintsUsed).toBe(2);

    await postAuthed('/api/game/levels/2/hints', token, csrf);
    const done = await postAuthed('/api/game/levels/2/hints', token, csrf);
    expect(done.statusCode).toBe(409);
    expect(done.json().error.code).toBe('NO_MORE_HINTS');
  });

  it('blocks hints on locked levels', async () => {
    const { token, csrf } = await registerAndLogin('player_lockhint');
    const res = await postAuthed('/api/game/levels/3/hints', token, csrf);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('LEVEL_LOCKED');
  });

  it('wires the final meta puzzle end-to-end', async () => {
    const { token, csrf } = await registerAndLogin('player_final');
    // The campaign unlocks strictly linearly, so solve every level in order.
    const playthrough: [number, string][] = [
      [1, 'session'],
      [2, 'blackout'],
      [3, 'licht'],
      [4, 'sos'],
      [5, 'dark'],
      [6, 'terminal'],
      [7, 'nebel'],
      [8, 'master'],
      [9, 'datei07'],
      [10, 'session-blackout'],
      [11, '342'],
      [12, 'stein14'],
      [13, 'signal'],
      [14, 'schirme'],
      [15, 'echo'],
      [16, 'acht'],
      [17, 'projekt'],
      [18, '99'],
      [19, 'terminal-nebel'],
    ];
    for (const [id, ans] of playthrough) {
      const res = await postAuthed(`/api/game/levels/${id}/submit`, token, csrf, { answer: ans });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.solved).toBe(true);
    }

    const still = await postAuthed('/api/game/levels/20/submit', token, csrf, { answer: 'nope' });
    expect(still.json().data.solved).toBe(false);

    const final = await postAuthed('/api/game/levels/20/submit', token, csrf, { answer: 'session-blackout-sos' });
    expect(final.statusCode).toBe(200);
    expect(final.json().data.solved).toBe(true);
    expect(final.json().data.storyReveal).toContain('PROJECT NULL');
  });

  it('resets progress for one user', async () => {
    const { token, csrf } = await registerAndLogin('player_reset');
    await postAuthed('/api/game/levels/1/submit', token, csrf, { answer: 'Session' });
    let progress = (await getAuthed('/api/game/progress', token)).json().data;
    expect(progress.solvedCount).toBe(1);

    const res = await postAuthed('/api/game/reset', token, csrf);
    expect(res.statusCode).toBe(200);

    progress = (await getAuthed('/api/game/progress', token)).json().data;
    expect(progress.solvedCount).toBe(0);
    expect(progress.currentLevelId).toBe(1);

    const locked = await getAuthed('/api/game/levels/2', token);
    expect(locked.statusCode).toBe(403);
  });
});

describe('Admin level management', () => {
  let adminSeq = 0;
  async function makeAdminSession(): Promise<{ token: string; csrf: string }> {
    adminSeq += 1;
    const unique = `admin_levels_${adminSeq}`;
    const user = await db.users.create({
      username: unique,
      email: `${unique}@te.st`,
      passwordHash: 'x-hash',
      role: 'admin',
    });
    const session = await db.sessions.create({
      userId: user.id,
      tokenHash: hashToken(`admin-level-session-${adminSeq}`),
      ipAddress: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 7_200_000),
    });
    return { token: `admin-level-session-${adminSeq}`, csrf: issueCsrfToken(session.id) };
  }

  it('forbids non-admin users from creating levels', async () => {
    const { token, csrf } = await registerAndLogin('player_notadmin');
    const res = await postAuthed('/api/admin/levels', token, csrf, {
      slug: 'hack-level',
      title: 'Hack',
      description: 'nope',
      answers: ['x'],
      difficulty: 1,
      puzzleType: 'TEXT',
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates, reads, updates and deletes a level as admin', async () => {
    const { token, csrf } = await makeAdminSession();

    const created = await postAuthed('/api/admin/levels', token, csrf, {
      slug: 'test-01',
      title: 'Test Level',
      description: 'A test level.',
      body: { text: 'What word does this hint point to?' },
      answers: ['geheimwort'],
      difficulty: 2,
      puzzleType: 'TEXT',
      hints: ['Hinweis eins'],
      storyReveal: 'NUMMER EINS',
      active: true,
    });
    expect(created.statusCode).toBe(200);
    const createdJson = created.json();
    expect(createdJson.data.slug).toBe('test-01');
    // Admin API legitimately contains answers.
    expect(createdJson.data.answers).toContain('geheimwort');
    const id = createdJson.data.id;

    const listed = await getAuthed('/api/admin/levels', token);
    const found = (listed.json().data.levels as { id: number; slug: string }[]).find((l) => l.id === id);
    expect(found).toBeDefined();

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/admin/levels/${id}`,
      cookies: { n26_session: token },
      headers: { 'x-csrf-token': csrf },
      payload: {
        slug: 'test-01',
        title: 'Test Level Updated',
        description: 'A test level.',
        answers: ['geheimwort'],
        difficulty: 2,
        puzzleType: 'TEXT',
        hints: ['Hinweis eins'],
        active: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.title).toBe('Test Level Updated');

    await app.inject({
      method: 'DELETE',
      url: `/api/admin/levels/${id}`,
      cookies: { n26_session: token },
      headers: { 'x-csrf-token': csrf },
    });
    const gone = await getAuthed(`/api/admin/levels/${id}`, token);
    expect(gone.statusCode).toBe(404);
  });

  it('rejects invalid admin input', async () => {
    const { token, csrf } = await makeAdminSession();
    const res = await postAuthed('/api/admin/levels', token, csrf, {
      slug: 'bad slug!',
      title: 'X',
      description: 'X',
      answers: ['x'],
      difficulty: 1,
      puzzleType: 'TEXT',
    });
    expect(res.statusCode).toBe(400);
  });

  it('sanitizes unsafe asset URLs when creating a level', async () => {
    const { token, csrf } = await makeAdminSession();
    const created = await postAuthed('/api/admin/levels', token, csrf, {
      slug: 'test-02',
      title: 'Asset Test',
      description: 'Safe asset URLs survive; unsafe ones are dropped.',
      body: {
        text: 'text',
        image: 'https://example.com/hint.png',
        audio: 'javascript:alert(1)',
        file: 'data:text/html;base64,PHNjcmlwdD4=',
      },
      answers: ['ok'],
      difficulty: 1,
      puzzleType: 'MIXED',
    });
    expect(created.statusCode).toBe(200);
    const body = created.json().data.body as { image?: string | null; audio?: string | null; file?: string | null };
    expect(body.image).toBe('https://example.com/hint.png');
    expect(body.audio).toBeNull();
    expect(body.file).toBeNull();
  });
});