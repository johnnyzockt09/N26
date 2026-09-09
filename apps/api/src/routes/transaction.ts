import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { Database } from '../db/database.js';
import { TransactionService } from '../services/transaction.js';
import { isValidUuid, isSafeDescription, isValidCents } from '@n26/shared';

export function registerTransactionRoutes(
  app: FastifyInstance,
  db: Database,
  transactions: TransactionService,
): void {
  app.get('/api/transactions', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const link = await db.links.findByUserId(req.auth!.userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }
    const list = await db.transactions.listForUuid(link.minecraftUuid, 50);
    return reply.send({ success: true, data: { transactions: list.map(toDto) } });
  });

  app.post('/api/transfer', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const body = req.body as {
      toUuid?: string;
      amountCents?: number;
      description?: string;
      idempotencyKey?: string;
    };
    const link = await db.links.findByUserId(req.auth!.userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }
    if (!body || typeof body !== 'object' || !body.toUuid || !isValidUuid(body.toUuid)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Empfänger-UUID ungültig' } });
    }
    if (!isValidCents(body.amountCents) || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Betrag ungültig' } });
    }
    if (body.toUuid.toLowerCase() === link.minecraftUuid.toLowerCase()) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Überweisung an sich selbst nicht möglich' } });
    }
    const description = (body.description ?? '').trim();
    if (!isSafeDescription(description)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Beschreibung ungültig' } });
    }

    const receiverLink = await db.links.findByUuid(body.toUuid);
    if (!receiverLink) {
      return reply.status(400).send({ success: false, error: { code: 'RECEIVER_NOT_FOUND', message: 'Empfänger nicht gefunden' } });
    }

    const result = await transactions.executeTransfer({
      fromUuid: link.minecraftUuid,
      fromName: link.minecraftUsername,
      toUuid: body.toUuid,
      toName: receiverLink.minecraftUsername,
      amountCents: body.amountCents,
      description,
      actorUserId: req.auth!.userId,
      idempotencyKey: body.idempotencyKey,
    });

    if (result.status === 'SUCCESS') {
      return reply.send({ success: true, data: { status: 'SUCCESS', transaction: toDto(result.transaction) } });
    }
    if (result.status === 'PENDING_RECONCILIATION') {
      return reply.status(202).send({ success: true, data: { status: 'PENDING_RECONCILIATION', transaction: toDto(result.transaction) } });
    }
    if (result.status === 'IN_PROGRESS') {
      return reply.send({ success: true, data: { status: result.status, transaction: toDto(result.transaction) } });
    }
    return reply.status(502).send({
      success: false,
      error: { code: 'TRANSFER_FAILED', message: 'Überweisung fehlgeschlagen. Minecraft-Server oder Data-Pack antwortet nicht.' },
    });
  });

  // Verification for >100 EUR transactions
  app.post('/api/payments/:id/verify', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const { id } = req.params as { id: string };
    const body = req.body as { token?: string };

    const tx = await db.transactions.findById(id);
    if (!tx) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Transaktion nicht gefunden' } });
    }
    if (tx.status !== 'PENDING_VERIFICATION') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_STATE', message: 'Transaktion nicht in Verifizierung' } });
    }
    // Only the initiator may verify
    const link = await db.links.findByUserId(req.auth!.userId);
    if (!link || link.minecraftUuid !== tx.fromUuid) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Nicht berechtigt' } });
    }
    if (!body || !body.token) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Token fehlt' } });
    }

    const result = await transactions.verifyAndExecute(id, body.token, req.auth!.userId);
    if (result.status === 'SUCCESS') {
      return reply.send({ success: true, data: { status: 'SUCCESS' } });
    }
    if (result.status === 'INVALID_TOKEN') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Ungültiger oder abgelaufener Verifizierungs-Token' } });
    }
    if (result.status === 'PENDING_RECONCILIATION') {
      return reply.status(202).send({ success: true, data: { status: 'PENDING_RECONCILIATION' } });
    }
    return reply.status(502).send({
      success: false,
      error: { code: 'TRANSFER_FAILED', message: 'Die Zahlung konnte nicht ausgeführt werden. Server nicht erreichbar.' },
    });
  });

  app.post('/api/transactions/:id/cancel', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const { id } = req.params as { id: string };
    const tx = await db.transactions.findById(id);
    if (!tx) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Transaktion nicht gefunden' } });
    }
    if (tx.status !== 'PENDING_VERIFICATION') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_STATE', message: 'Nur ausstehende Verifizierungen können storniert werden' } });
    }
    await db.transactions.updateStatus(id, 'CANCELLED');
    return reply.send({ success: true, data: { status: 'CANCELLED' } });
  });

  // Public lookup for the recipient: resolve a name for a UUID
  app.get('/api/account/by-uuid', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const query = req.query as { uuid?: string };
    if (!query.uuid || !isValidUuid(query.uuid)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'UUID ungültig' } });
    }
    const link = await db.links.findByUuid(query.uuid);
    return reply.send({ success: true, data: { username: link?.minecraftUsername ?? null, exists: Boolean(link) } });
  });
}

function toDto(tx: { transactionNumber: string; amountCents: number; fromUuid: string; fromName: string; toUuid: string; toName: string; description: string; status: string; idempotencyKey: string | null; createdAt: Date; paidAt: Date | null; id: string }): Record<string, unknown> {
  return {
    id: tx.id,
    transactionNumber: tx.transactionNumber,
    amountCents: tx.amountCents,
    from: { uuid: tx.fromUuid, name: tx.fromName },
    to: { uuid: tx.toUuid, name: tx.toName },
    description: tx.description,
    status: tx.status,
    idempotencyKey: tx.idempotencyKey,
    createdAt: tx.createdAt.toISOString(),
    paidAt: tx.paidAt?.toISOString() ?? null,
  };
}