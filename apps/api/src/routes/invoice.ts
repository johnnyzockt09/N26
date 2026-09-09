import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { Database } from '../db/database.js';
import { TransactionService } from '../services/transaction.js';
import { isValidUuid, isSafeDescription, isValidCents } from '@n26/shared';

export function registerInvoiceRoutes(
  app: FastifyInstance,
  db: Database,
  transactions: TransactionService,
): void {
  app.get('/api/invoices', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const link = await db.links.findByUserId(req.auth!.userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }
    const list = await db.invoices.listForUuid(link.minecraftUuid, 50);
    return reply.send({ success: true, data: { invoices: list.map(toInvoiceDto) } });
  });

  app.post('/api/invoices', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const body = req.body as {
      toUuid?: string;
      amountCents?: number;
      description?: string;
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
    const description = (body.description ?? '').trim();
    if (!isSafeDescription(description)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Beschreibung ungültig' } });
    }
    const receiver = await db.links.findByUuid(body.toUuid);
    if (!receiver) {
      return reply.status(400).send({ success: false, error: { code: 'RECEIVER_NOT_FOUND', message: 'Empfänger nicht gefunden' } });
    }

    const invoice = await transactions.createInvoice({
      fromUuid: link.minecraftUuid,
      fromName: link.minecraftUsername,
      toUuid: body.toUuid,
      toName: receiver.minecraftUsername,
      amountCents: body.amountCents,
      description,
      actorUserId: req.auth!.userId,
    });
    return reply.status(201).send({ success: true, data: { invoice: toInvoiceDto(invoice) } });
  });

  app.post('/api/invoices/:id/pay', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const { id } = req.params as { id: string };
    const link = await db.links.findByUserId(req.auth!.userId);
    if (!link) {
      return reply.status(400).send({ success: false, error: { code: 'NO_LINK', message: 'Kein Minecraft-Account verknüpft' } });
    }
    const result = await transactions.payInvoice(id, link.minecraftUuid, link.minecraftUsername, req.auth!.userId);
    if (result.status === 'NOT_FOUND') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
    }
    if (result.status === 'ALREADY_PAID') {
      return reply.status(400).send({ success: false, error: { code: 'ALREADY_PAID', message: 'Rechnung wurde bereits bezahlt' } });
    }
    if (result.status === 'SUCCESS') {
      return reply.send({ success: true, data: { status: 'SUCCESS' } });
    }
    if ('verification' in result && result.verification) {
      return reply.send({ success: true, data: { status: 'PENDING_VERIFICATION', verificationToken: result.verification.token, ttlSeconds: result.verification.ttlSeconds } });
    }
    if (result.status === 'PENDING_RECONCILIATION') {
      return reply.status(202).send({ success: true, data: { status: 'PENDING_RECONCILIATION' } });
    }
    return reply.status(502).send({
      success: false,
      error: { code: 'PAYMENT_FAILED', message: 'Zahlung fehlgeschlagen. Server nicht erreichbar.' },
    });
  });

  app.post('/api/invoices/:id/cancel', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const { id } = req.params as { id: string };
    const invoice = await db.invoices.findById(id);
    if (!invoice) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
    }
    if (invoice.status !== 'OPEN') {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_STATE', message: 'Rechnung ist nicht offen' } });
    }
    await db.invoices.updateStatus(id, 'CANCELLED');
    return reply.send({ success: true, data: { status: 'CANCELLED' } });
  });
}

function toInvoiceDto(invoice: {
  id: string; invoiceNumber: string; fromUuid: string; fromName: string; toUuid: string; toName: string;
  amountCents: number; description: string; status: string; createdAt: Date; paidAt: Date | null;
}): Record<string, unknown> {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    from: { uuid: invoice.fromUuid, name: invoice.fromName },
    to: { uuid: invoice.toUuid, name: invoice.toName },
    amountCents: invoice.amountCents,
    description: invoice.description,
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}