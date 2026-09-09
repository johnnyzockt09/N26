import { FastifyInstance } from 'fastify';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { Database } from '../db/database.js';
import { RconService } from '../services/rcon.js';
import { StatusService } from '../services/status.js';
import { LevelService } from '../services/levels.js';
import {
  LevelBody,
  LevelDifficulty,
  LevelFull,
  PuzzleType,
  StoryKey,
} from '@n26/shared';

const PUZZLE_TYPES: PuzzleType[] = ['TEXT', 'IMAGE', 'AUDIO', 'FILE', 'URL', 'CODE', 'META', 'MIXED'];
const STORY_KEYS: StoryKey[] = ['UNKNOWN', 'PROJECT_NULL', 'WORLD_01', 'WORLD_02', 'WORLD_03'];

function isValidDifficulty(value: unknown): value is LevelDifficulty {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/**
 * Asset URLs are rendered by the client as <img src>, <audio src> and
 * <a href download>. Only allow safe schemes: same-origin paths (but not
 * protocol-relative "//host") or explicit http(s). Rejects javascript:,
 * data: and blob: so a compromised editor can never inject script URLs.
 */
function isSafeAssetUrl(value: string): boolean {
  if (value.startsWith('//')) return false;
  return value.startsWith('/') || /^https?:\/\//i.test(value);
}

function sanitizeBody(value: unknown): LevelBody {
  const src = (value ?? {}) as Record<string, unknown>;
  const pickUrl = (v: unknown): string | null =>
    typeof v === 'string' && v && isSafeAssetUrl(v) ? v.slice(0, 500) : null;
  return {
    text: typeof src.text === 'string' ? src.text.slice(0, 4000) : undefined,
    code: typeof src.code === 'string' ? src.code.slice(0, 8000) : undefined,
    image: pickUrl(src.image),
    audio: pickUrl(src.audio),
    file: pickUrl(src.file),
    extra: typeof src.extra === 'object' && src.extra !== null ? src.extra as Record<string, string> : null,
  };
}

function sanitizeLevelInput(body: Record<string, unknown>): {
  input: Parameters<LevelService['create']>[0];
  error?: string;
} {
  const slug = typeof body.slug === 'string' ? body.slug.trim().slice(0, 120) : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
  const answers = Array.isArray(body.answers)
    ? body.answers.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter((a) => a.length > 0 && a.length <= 200)
    : [];
  const difficultyValue = body.difficulty;
  const puzzleType = typeof body.puzzleType === 'string' ? (body.puzzleType as PuzzleType) : undefined;
  const hints = Array.isArray(body.hints)
    ? body.hints.filter((h): h is string => typeof h === 'string').map((h) => h.trim().slice(0, 600)).filter((h) => h.length > 0)
    : [];
  const requiresLevelId = body.requiresLevelId === null || body.requiresLevelId === undefined
    ? null
    : Number(body.requiresLevelId);
  const storyKey = typeof body.storyKey === 'string' ? body.storyKey as StoryKey : null;
  const storyReveal = typeof body.storyReveal === 'string' ? body.storyReveal.slice(0, 500) : null;
  const active = typeof body.active === 'boolean' ? body.active : true;

  if (!slug || !/^[a-zA-Z0-9-]+$/.test(slug)) {
    return { input: undefined as never, error: 'slug_fehlt' };
  }
  if (!title || !description || answers.length === 0) {
    return { input: undefined as never, error: 'felder_fehlen' };
  }
  if (!isValidDifficulty(difficultyValue)) {
    return { input: undefined as never, error: 'schwierigkeit_ungueltig' };
  }
  if (!puzzleType || !PUZZLE_TYPES.includes(puzzleType)) {
    return { input: undefined as never, error: 'puzzletype_ungueltig' };
  }
  if (storyKey && !STORY_KEYS.includes(storyKey)) {
    return { input: undefined as never, error: 'storykey_ungueltig' };
  }
  if (requiresLevelId !== null && (!Number.isInteger(requiresLevelId) || requiresLevelId < 1)) {
    return { input: undefined as never, error: 'vorbedingung_ungueltig' };
  }

  return {
    input: {
      slug,
      title,
      description,
      answers,
      difficulty: difficultyValue,
      puzzleType,
      body: sanitizeBody(body.body),
      hints,
      requiresLevelId,
      storyKey,
      storyReveal,
      active,
    },
  };
}

/**
 * Admin routes. Admin status is derived from the web user's database role,
 * never only from a display name. Granting admin: set role='admin' in the
 * users table for the specific user_ids of Johnny/David.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  db: Database,
  rcon: RconService,
  status: StatusService,
  levelService?: LevelService,
): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/admin')) return;
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const adminOk = await requireAdmin(req, reply);
    if (!adminOk) return reply;
  });

  app.get('/api/admin/status', async (_req, reply) => {
    const result = await status.getStatus();
    return reply.send({ success: true, data: result });
  });

  app.get('/api/admin/accounts', async (_req, reply) => {
    const users = await db.users.list();
    const accounts = [];
    for (const user of users) {
      const link = await db.links.findByUserId(user.id);
      accounts.push({
        userId: user.id,
        username: user.username,
        role: user.role,
        locked: user.locked,
        minecraft: link ? { uuid: link.minecraftUuid, username: link.minecraftUsername, linkedAt: link.linkedAt.toISOString() } : null,
      });
    }
    return reply.send({ success: true, data: { accounts } });
  });

  app.get('/api/admin/transactions', async (req, reply) => {
    const query = req.query as { status?: string; limit?: string };
    const limit = Math.min(Number(query.limit) || 50, 200);
    if (query.status) {
      const list = await db.transactions.listByStatus(query.status as never, limit);
      return reply.send({ success: true, data: { transactions: list } });
    }
    const users = await db.users.list();
    const out = [];
    for (const user of users) {
      const link = await db.links.findByUserId(user.id);
      if (link) {
        const txs = await db.transactions.listForUuid(link.minecraftUuid, 20);
        out.push(...txs);
      }
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return reply.send({ success: true, data: { transactions: out.slice(0, limit) } });
  });

  app.get('/api/admin/invoices', async (_req, reply) => {
    const invoices = await db.invoices.listAll(200);
    return reply.send({ success: true, data: { invoices } });
  });

  app.get('/api/admin/tokens', async (_req, reply) => {
    const tokens = await db.tokens.listAll(200);
    return reply.send({ success: true, data: { tokens } });
  });

  app.get('/api/admin/audit', async (req, reply) => {
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit) || 100, 500);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const logs = await db.auditLogs.list(limit, offset);
    return reply.send({ success: true, data: { logs } });
  });

  app.post('/api/admin/account/lock', async (req, reply) => {
    const body = req.body as { uuid?: string };
    if (!body || !body.uuid) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'UUID fehlt' } });
    }
    const link = await db.links.findByUuid(body.uuid);
    if (!link) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Account nicht gefunden' } });
    const result = await rcon.toggleAccountLock(body.uuid, true);
    if (result.status === 'NO_RESPONSE') {
      return reply.status(502).send({ success: false, error: { code: 'DATAPACK_UNREACHABLE', message: 'Data-Pack nicht erreichbar' } });
    }
    await db.auditLogs.create({ event: 'ACCOUNT_LOCK', actorUserId: req.auth!.userId, actorUuid: body.uuid });
    return reply.send({ success: true, data: { status: 'LOCKED' } });
  });

  app.post('/api/admin/account/unlock', async (req, reply) => {
    const body = req.body as { uuid?: string };
    if (!body || !body.uuid) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'UUID fehlt' } });
    }
    const link = await db.links.findByUuid(body.uuid);
    if (!link) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Account nicht gefunden' } });
    const result = await rcon.toggleAccountLock(body.uuid, false);
    if (result.status === 'NO_RESPONSE') {
      return reply.status(502).send({ success: false, error: { code: 'DATAPACK_UNREACHABLE', message: 'Data-Pack nicht erreichbar' } });
    }
    await db.auditLogs.create({ event: 'ACCOUNT_UNLOCK', actorUserId: req.auth!.userId, actorUuid: body.uuid });
    return reply.send({ success: true, data: { status: 'UNLOCKED' } });
  });

  /**
   * Kick a player. FIXED action only – the backend validates the player
   * name and builds the /kick command itself. There is no arbitrary
   * command execution endpoint.
   */
  app.post('/api/admin/kick', async (req, reply) => {
    const body = req.body as { username?: string; reason?: string };
    if (!body || typeof body.username !== 'string' || !body.username.trim()) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Spielername fehlt' } });
    }
    const result = await rcon.kickPlayer(body.username.trim(), typeof body.reason === 'string' ? body.reason : undefined);
    if (result.status === 'INVALID_PLAYER') {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültiger Spielername' } });
    }
    if (result.status === 'NO_RESPONSE') {
      return reply.status(502).send({ success: false, error: { code: 'SERVER_UNREACHABLE', message: 'Server nicht erreichbar' } });
    }
    await db.auditLogs.create({
      event: 'ACCOUNT_KICK',
      actorUserId: req.auth!.userId,
      details: { target: body.username.trim(), reason: body.reason ?? null },
    });
    return reply.send({ success: true, data: { status: 'KICKED' } });
  });

  if (levelService) {
    app.get('/api/admin/levels', async (_req, reply) => {
      const levels: LevelFull[] = await levelService.listAll();
      return reply.send({ success: true, data: { levels } });
    });

    app.get('/api/admin/levels/:id', async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!Number.isInteger(id) || id < 1) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
      }
      const levels: LevelFull[] = await levelService.listAll();
      const level = levels.find((l) => l.id === id);
      if (!level) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Level nicht gefunden' } });
      return reply.send({ success: true, data: level });
    });

    app.post('/api/admin/levels', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { input, error } = sanitizeLevelInput(body);
      if (error) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: `Ungültige Eingabe: ${error}` } });
      }
      const level = await levelService.create(input, undefined, req.auth!.userId);
      return reply.send({ success: true, data: level });
    });

    app.put('/api/admin/levels/:id', async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!Number.isInteger(id) || id < 1) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { input, error } = sanitizeLevelInput(body);
      if (error) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: `Ungültige Eingabe: ${error}` } });
      }
      const level = await levelService.update(id, input, req.auth!.userId);
      if (!level) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Level nicht gefunden' } });
      return reply.send({ success: true, data: level });
    });

    app.delete('/api/admin/levels/:id', async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!Number.isInteger(id) || id < 1) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
      }
      await levelService.remove(id, req.auth!.userId);
      return reply.send({ success: true, data: { status: 'DELETED' } });
    });
  }
}