import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { LevelService } from '../services/levels.js';

/**
 * Player-facing level routes. Never expose answer keys: everything sent to
 * the client comes from `LevelContent`/`LevelMeta` only (body + unlocked
 * hints). Answer validation happens server-side in `LevelService.submitAnswer`.
 */
export function registerGameRoutes(app: FastifyInstance, levelService: LevelService): void {
  app.get('/api/game/levels', { preHandler: requireAuth }, async (req, reply) => {
    const meta = await levelService.listLevels(req.auth!.userId);
    return reply.send({ success: true, data: { levels: meta } });
  });

  app.get('/api/game/levels/:id', { preHandler: requireAuth }, async (req, reply) => {
    const levelId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(levelId) || levelId < 1) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
    }
    const result = await levelService.getLevel(req.auth!.userId, levelId);
    if ('code' in result) {
      const status = result.code === 'LEVEL_NOT_FOUND' ? 404 : 403;
      return reply.status(status).send({ success: false, error: result });
    }
    return reply.send({ success: true, data: result });
  });

  app.post('/api/game/levels/:id/submit', { preHandler: requireAuth }, async (req, reply) => {
    const levelId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(levelId) || levelId < 1) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
    }
    const body = req.body as { answer?: unknown };
    const result = await levelService.submitAnswer(req.auth!.userId, levelId, body?.answer);
    if ('code' in result && result.code === 'INVALID_ANSWER') {
      return reply.status(400).send({ success: false, error: result });
    }
    if ('code' in result && result.code === 'LEVEL_NOT_FOUND') {
      return reply.status(404).send({ success: false, error: result });
    }
    if ('code' in result) {
      return reply.status(403).send({ success: false, error: result });
    }
    return reply.send({ success: true, data: result });
  });

  app.post('/api/game/levels/:id/hints', { preHandler: requireAuth }, async (req, reply) => {
    const levelId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(levelId) || levelId < 1) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Level-ID' } });
    }
    const result = await levelService.unlockHint(req.auth!.userId, levelId);
    if ('code' in result) {
      const status = result.code === 'NO_MORE_HINTS' ? 409 : result.code === 'LEVEL_NOT_FOUND' ? 404 : 403;
      return reply.status(status).send({ success: false, error: result });
    }
    return reply.send({ success: true, data: result });
  });

  app.get('/api/game/progress', { preHandler: requireAuth }, async (req, reply) => {
    const progress = await levelService.getProgress(req.auth!.userId);
    return reply.send({ success: true, data: progress });
  });

  app.post('/api/game/reset', { preHandler: requireAuth }, async (req, reply) => {
    await levelService.resetProgress(req.auth!.userId);
    return reply.send({ success: true, data: { status: 'RESET' } });
  });
}