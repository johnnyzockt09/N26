import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { Database } from '../db/database.js';
import { RconService } from '../services/rcon.js';

/**
 * Account routes. Balances always come from the data pack over RCON –
 * never trusted from client input. Key/Hash/Hash_Value never leave the
 * Minecraft side.
 */
export function registerAccountRoutes(app: FastifyInstance, db: Database, rcon: RconService): void {
  app.get('/api/account', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const userId = req.auth!.userId;
    const link = await db.links.findByUserId(userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }

    const balance = await rcon.getBalance(link.minecraftUuid);
    const verified = await rcon.verifyAccount(link.minecraftUuid);

    return reply.send({
      success: true,
      data: {
        minecraft: {
          uuid: link.minecraftUuid,
          username: link.minecraftUsername,
          linkedAt: link.linkedAt.toISOString(),
        },
        status: balance.accountOk && verified.valid ? 'ACTIVE' : 'LOCKED',
        balanceCents: balance.balanceCents,
        registered: balance.registered,
        lastVerifiedAt: link.lastVerifiedAt.toISOString(),
        source: 'datapack',
      },
    });
  });

  app.get('/api/account/balance', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const userId = req.auth!.userId;
    const link = await db.links.findByUserId(userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }
    const balance = await rcon.getBalance(link.minecraftUuid);
    if (balance.status === 'NO_RESPONSE') {
      return reply.status(503).send({
        success: false,
        error: { code: 'DATAPACK_UNREACHABLE', message: 'Data-Pack nicht erreichbar. Bitte später erneut versuchen.' },
      });
    }
    return reply.send({ success: true, data: { balanceCents: balance.balanceCents, accountOk: balance.accountOk, status: balance.status } });
  });
}