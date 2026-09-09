import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { LinkingService } from '../services/linking.js';
import { Database } from '../db/database.js';

export function registerLinkRoutes(app: FastifyInstance, linking: LinkingService, db: Database): void {
  app.post('/api/minecraft/link/start', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const result = await linking.startChallenge(req.auth!.userId);
    if (result.code === 'ALREADY_LINKED') {
      return reply.status(400).send({ success: false, error: { code: 'ALREADY_LINKED', message: 'Minecraft-Account bereits verknüpft' } });
    }
    return reply.send({ success: true, data: result });
  });

  app.post('/api/minecraft/link/complete', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const body = req.body as { code?: string };
    if (!body || !body.code) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Code fehlt' } });
    }
    const result = await linking.checkChallenge(req.auth!.userId, body.code);
    return reply.send({ success: result.status === 'COMPLETED', data: result });
  });

  app.get('/api/minecraft/link/status', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const query = req.query as { code?: string };
    if (!query.code) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Code fehlt' } });
    }
    const result = await linking.checkChallenge(req.auth!.userId, query.code);
    if (result.status === 'DENIED') {
      return reply.status(403).send({
        success: false,
        data: { status: 'DENIED' },
        error: { code: 'LINK_DENIED', message: 'Dieser Minecraft-Account darf nicht verknüpft werden' },
      });
    }
    return reply.send({ success: result.status === 'COMPLETED', data: result });
  });

  app.post('/api/minecraft/link/cancel', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    await db.linkChallenges.markCancelledForUser(req.auth!.userId);
    return reply.send({ success: true });
  });
}