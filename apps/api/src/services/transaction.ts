import { config } from '../config/index.js';
import { Database } from '../db/database.js';
import {
  generateIdempotencyKey,
  generateInvoiceNumber,
  generateTransactionNumber,
  generateVerificationToken,
  hashToken,
} from '../lib/security.js';
import { RconService } from './rcon.js';
import { TRANSFER_LIMIT_CENTS } from '@n26/shared';

/**
 * TransactionService coordinates web DB state with the authoritative
 * data pack execution through RCON.
 */
export class TransactionService {
  constructor(
    private readonly db: Database,
    private readonly rcon: RconService,
  ) {}

  /**
   * Build a new transaction row. Idempotent per idempotencyKey, so retries
   * (e.g. after connection loss) never create duplicates.
   */
  async createTransaction(input: {
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    amountCents: number;
    description: string;
    idempotencyKey?: string;
  }) {
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    const existing = await this.db.transactions.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { existing: true, transaction: existing };
    }
    const number = generateTransactionNumber();
    const wantsVerification = input.amountCents > TRANSFER_LIMIT_CENTS;
    const status = wantsVerification ? 'PENDING_VERIFICATION' : 'PENDING';
    const transaction = await this.db.transactions.create({
      transactionNumber: number,
      amountCents: input.amountCents,
      fromUuid: input.fromUuid,
      fromName: input.fromName,
      toUuid: input.toUuid,
      toName: input.toName,
      description: input.description,
      status,
      idempotencyKey,
    });
    return { existing: false, transaction };
  }

  /**
   * Issue a single-use verification token for a >100 EUR transaction
   * awaiting web confirmation.
   */
  async createVerification(transactionId: string, userId: string): Promise<{ token: string; ttlSeconds: number }> {
    const token = generateVerificationToken();
    const ttl = config.verification.ttlSeconds;
    await this.db.verificationTokens.create({
      tokenHash: hashToken(token),
      transactionId,
      userId,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
    await this.db.transactions.markVerified(transactionId, hashToken(token), new Date(Date.now() + ttl * 1000));
    return { token, ttlSeconds: ttl };
  }

  /**
   * Verify a transaction using a single-use token, then execute it through
   * the data pack via RCON. Uses a generated request id per attempt.
   */
  async verifyAndExecute(transactionId: string, rawToken: string, actorUserId: string): Promise<{ status: string }> {
    const tokenHash = hashToken(rawToken);
    const vt = await this.db.verificationTokens.findValidByHash(tokenHash);
    if (!vt || vt.transactionId !== transactionId) {
      await this.db.auditLogs.create({ event: 'PAYMENT_VERIFY_FAIL', actorUserId, details: { transactionId, reason: 'invalid_token' } });
      return { status: 'INVALID_TOKEN' };
    }

    const transaction = await this.db.transactions.findById(transactionId);
    if (!transaction || transaction.status !== 'PENDING_VERIFICATION') {
      return { status: 'INVALID_STATE' };
    }

    await this.db.verificationTokens.markConsumed(tokenHash);

    const rconRes = await this.rcon.requestTransfer({
      id: transaction.id,
      fromUuid: transaction.fromUuid,
      toUuid: transaction.toUuid,
      amountCents: transaction.amountCents,
      idempotencyKey: transaction.idempotencyKey ?? '',
      description: transaction.description,
    });

    if (rconRes.status === 'SUCCESS') {
      await this.db.transactions.markPaid(transactionId, tokenHash);
      await this.db.auditLogs.create({
        event: 'TRANSFER',
        actorUserId,
        details: { transactionNumber: transaction.transactionNumber, amountCents: transaction.amountCents },
      });
      await this.db.auditLogs.create({ event: 'PAYMENT_VERIFY', actorUserId, details: { transactionId } });
      return { status: 'SUCCESS' };
    }

    if (rconRes.status === 'NO_RESPONSE') {
      // Uncertain outcome: never blindly reuse the idempotency key.
      await this.db.transactions.updateStatus(transactionId, 'PENDING_RECONCILIATION');
      await this.db.auditLogs.create({
        event: 'RCON_ERROR',
        actorUserId,
        details: { transactionId, reason: 'application_response_lost' },
      });
      return { status: 'PENDING_RECONCILIATION' };
    }

    await this.db.transactions.updateStatus(transactionId, 'FAILED');
    await this.db.auditLogs.create({
      event: 'TRANSFER',
      actorUserId,
      details: { transactionNumber: transaction.transactionNumber, outcome: rconRes.status },
    });
    return { status: 'FAILED' };
  }

  /**
   * Execute a transfer that does NOT require web verification (<=100 EUR).
   */
  async executeTransfer(input: {
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    amountCents: number;
    description: string;
    actorUserId: string;
    idempotencyKey?: string;
  }) {
    const created = await this.createTransaction(input);
    if (created.existing) {
      const t = created.transaction;
      if (t.status === 'SUCCESS') return { status: 'SUCCESS', transaction: t };
      return { status: 'IN_PROGRESS', transaction: t };
    }

    // Verify recipients & accounts through the data pack before any action.
    const rconRes = await this.rcon.requestTransfer({
      id: created.transaction.id,
      fromUuid: input.fromUuid,
      toUuid: input.toUuid,
      amountCents: input.amountCents,
      idempotencyKey: created.transaction.idempotencyKey ?? '',
      description: input.description,
    });

    if (rconRes.status === 'SUCCESS') {
      await this.db.transactions.markPaid(created.transaction.id);
      await this.db.auditLogs.create({
        event: 'TRANSFER',
        actorUserId: input.actorUserId,
        details: { transactionNumber: created.transaction.transactionNumber, amountCents: input.amountCents },
      });
      return { status: 'SUCCESS', transaction: created.transaction };
    }

    if (rconRes.status === 'NO_RESPONSE') {
      await this.db.transactions.updateStatus(created.transaction.id, 'PENDING_RECONCILIATION');
      await this.db.auditLogs.create({
        event: 'RCON_ERROR',
        actorUserId: input.actorUserId,
        details: { transactionId: created.transaction.id, reason: 'application_response_lost' },
      });
      return { status: 'PENDING_RECONCILIATION', transaction: created.transaction };
    }

    await this.db.transactions.updateStatus(created.transaction.id, 'FAILED');
    await this.db.auditLogs.create({ event: 'TRANSFER', actorUserId: input.actorUserId, details: { outcome: rconRes.status } });
    return { status: 'FAILED', transaction: created.transaction };
  }

  /**
   * Reconciliation: check whether a pending transaction actually executed
   * on the Minecraft side using the idempotency key. Never re-runs blindly.
   */
  async reconcile(transactionId: string): Promise<{ status: string }> {
    const transaction = await this.db.transactions.findById(transactionId);
    if (!transaction) return { status: 'NOT_FOUND' };
    if (transaction.status !== 'PENDING_RECONCILIATION') {
      return { status: transaction.status };
    }
    // Ask the data pack whether the idempotency key was already applied.
    const answer = await this.rcon.callDataPack<{ applied?: number }>('n26:web/reconcile', {
      action: 'reconcile',
      idem: transaction.idempotencyKey,
      id: transaction.id,
    }, transaction.id);
    if (answer?.applied) {
      await this.db.transactions.markPaid(transactionId);
      return { status: 'SUCCESS' };
    }
    return { status: 'PENDING_RECONCILIATION' };
  }

  async createInvoice(input: {
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    amountCents: number;
    description: string;
    actorUserId: string;
  }) {
    const invoice = await this.db.invoices.create({
      invoiceNumber: generateInvoiceNumber(),
      fromUuid: input.fromUuid,
      fromName: input.fromName,
      toUuid: input.toUuid,
      toName: input.toName,
      amountCents: input.amountCents,
      description: input.description,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await this.db.auditLogs.create({
      event: 'INVOICE_CREATE',
      actorUserId: input.actorUserId,
      details: { invoiceNumber: invoice.invoiceNumber, amountCents: input.amountCents },
    });
    return invoice;
  }

  async payInvoice(invoiceId: string, payerUuid: string, payerName: string, actorUserId: string) {
    const invoice = await this.db.invoices.findById(invoiceId);
    if (!invoice) return { status: 'NOT_FOUND' };
    if (invoice.status !== 'OPEN') return { status: 'ALREADY_PAID' };

    const wantsVerification = invoice.amountCents > TRANSFER_LIMIT_CENTS;
    const tx = await this.createTransaction({
      fromUuid: payerUuid,
      fromName: payerName,
      toUuid: invoice.fromUuid,
      toName: invoice.fromName,
      amountCents: invoice.amountCents,
      description: `Rechnung ${invoice.invoiceNumber}: ${invoice.description}`,
    });

    if (!wantsVerification) {
      const rconRes = await this.rcon.requestTransfer({
        id: tx.transaction.id,
        fromUuid: payerUuid,
        toUuid: invoice.fromUuid,
        amountCents: invoice.amountCents,
        idempotencyKey: tx.transaction.idempotencyKey ?? '',
        description: tx.transaction.description,
      });
      if (rconRes.status === 'SUCCESS') {
        await this.db.invoices.markPaid(invoiceId, tx.transaction.id);
        await this.db.transactions.markPaid(tx.transaction.id);
        await this.db.auditLogs.create({ event: 'INVOICE_PAY', actorUserId, details: { invoiceNumber: invoice.invoiceNumber } });
        return { status: 'SUCCESS', transaction: tx.transaction };
      }
      if (rconRes.status === 'NO_RESPONSE') {
        await this.db.transactions.updateStatus(tx.transaction.id, 'PENDING_RECONCILIATION');
        return { status: 'PENDING_RECONCILIATION', transaction: tx.transaction };
      }
      return { status: 'FAILED', transaction: tx.transaction };
    }

    // Verification required
    const token = await this.createVerification(tx.transaction.id, actorUserId);
    return { status: 'PENDING_VERIFICATION', transaction: tx.transaction, verification: token };
  }
}