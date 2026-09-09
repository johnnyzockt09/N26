import { FastifyInstance } from 'fastify';
import { StatusService } from '../services/status.js';

export function registerStatusRoutes(app: FastifyInstance, status: StatusService): void {
  app.get('/api/status', async (_req, reply) => {
    const result = await status.getStatus();
    return reply.send({ success: true, data: result });
  });

  app.get('/api/health', async (_req, reply) => {
    return reply.send({ status: 'ok' });
  });
}