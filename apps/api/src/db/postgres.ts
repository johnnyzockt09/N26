import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AuditLogRecord,
  AuditLogRepository,
  Database,
  InvoiceRecord,
  InvoiceRepository,
  LevelBody,
  LevelDifficulty,
  LevelHintRecord,
  LevelHintRepository,
  LevelProgressRecord,
  LevelProgressRepository,
  LevelRecord,
  LevelRepository,
  LinkChallengeRecord,
  LinkChallengeRepository,
  MinecraftLinkRecord,
  MinecraftLinkRepository,
  PuzzleType,
  SessionRecord,
  SessionRepository,
  StoryKey,
  TokenRecord,
  TokenRepository,
  TransactionRecord,
  TransactionRepository,
  UserRecord,
  UserRepository,
  VerificationTokenRecord,
  VerificationTokenRepository,
} from './database.js';

const { Pool } = pg;

const MIGRATIONS_DIR = join(process.cwd(), '..', '..', 'database', 'migrations');

export class PostgresDatabase implements Database {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly links: MinecraftLinkRepository;
  readonly linkChallenges: LinkChallengeRepository;
  readonly transactions: TransactionRepository;
  readonly invoices: InvoiceRepository;
  readonly tokens: TokenRepository;
  readonly auditLogs: AuditLogRepository;
  readonly verificationTokens: VerificationTokenRepository;
  readonly levels: LevelRepository;
  readonly levelHints: LevelHintRepository;
  readonly levelProgress: LevelProgressRepository;

  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
    this.users = new PgUserRepository(this.pool);
    this.sessions = new PgSessionRepository(this.pool);
    this.links = new PgMinecraftLinkRepository(this.pool);
    this.linkChallenges = new PgLinkChallengeRepository(this.pool);
    this.transactions = new PgTransactionRepository(this.pool);
    this.invoices = new PgInvoiceRepository(this.pool);
    this.tokens = new PgTokenRepository(this.pool);
    this.auditLogs = new PgAuditLogRepository(this.pool);
    this.verificationTokens = new PgVerificationTokenRepository(this.pool);
    this.levels = new PgLevelRepository(this.pool);
    this.levelHints = new PgLevelHintRepository(this.pool);
    this.levelProgress = new PgLevelProgressRepository(this.pool);
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async runMigration(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ---------- helpers ----------

function mapUser(r: Record<string, unknown>): UserRecord {
  return {
    id: r.id as string,
    username: r.username as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    role: r.role as UserRecord['role'],
    locked: Boolean(r.locked),
    lockedReason: (r.locked_reason as string) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

function mapSession(r: Record<string, unknown>): SessionRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    tokenHash: r.token_hash as string,
    ipAddress: (r.ip_address as string) ?? null,
    userAgent: (r.user_agent as string) ?? null,
    createdAt: new Date(r.created_at as string),
    expiresAt: new Date(r.expires_at as string),
    revokedAt: r.revoked_at ? new Date(r.revoked_at as string) : null,
    rotatedAt: r.rotated_at ? new Date(r.rotated_at as string) : null,
  };
}

function mapLink(r: Record<string, unknown>): MinecraftLinkRecord {
  return {
    userId: r.user_id as string,
    minecraftUuid: r.minecraft_uuid as string,
    minecraftUsername: r.minecraft_username as string,
    linkedAt: new Date(r.linked_at as string),
    lastVerifiedAt: new Date(r.last_verified_at as string),
  };
}

function mapChallenge(r: Record<string, unknown>): LinkChallengeRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    challengeCode: r.challenge_code as string,
    pinHash: r.pin_hash as string,
    status: r.status as LinkChallengeRecord['status'],
    expiresAt: new Date(r.expires_at as string),
    createdAt: new Date(r.created_at as string),
  };
}

function mapTransaction(r: Record<string, unknown>): TransactionRecord {
  return {
    id: r.id as string,
    transactionNumber: r.transaction_number as string,
    amountCents: Number(r.amount_cents),
    fromUuid: r.from_uuid as string,
    fromName: r.from_name as string,
    toUuid: r.to_uuid as string,
    toName: r.to_name as string,
    description: r.description as string,
    status: r.status as TransactionRecord['status'],
    idempotencyKey: (r.idempotency_key as string) ?? null,
    verificationTokenHash: (r.verification_token_hash as string) ?? null,
    verificationExpiresAt: r.verification_expires_at ? new Date(r.verification_expires_at as string) : null,
    createdAt: new Date(r.created_at as string),
    paidAt: r.paid_at ? new Date(r.paid_at as string) : null,
  };
}

function mapInvoice(r: Record<string, unknown>): InvoiceRecord {
  return {
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    fromUuid: r.from_uuid as string,
    fromName: r.from_name as string,
    toUuid: r.to_uuid as string,
    toName: r.to_name as string,
    amountCents: Number(r.amount_cents),
    description: r.description as string,
    status: r.status as InvoiceRecord['status'],
    expiresAt: r.expires_at ? new Date(r.expires_at as string) : null,
    transactionId: (r.transaction_id as string) ?? null,
    createdAt: new Date(r.created_at as string),
    paidAt: r.paid_at ? new Date(r.paid_at as string) : null,
  };
}

function mapToken(r: Record<string, unknown>): TokenRecord {
  return {
    tokenId: r.token_id as string,
    ownerUuid: r.owner_uuid as string,
    valueCents: Number(r.value_cents),
    status: r.status as TokenRecord['status'],
    mobilityId: (r.mobility_id as string) ?? null,
    createdAt: new Date(r.created_at as string),
    redeemedAt: r.redeemed_at ? new Date(r.redeemed_at as string) : null,
    copySourceToken: (r.copy_source_token as string) ?? null,
  };
}

function mapAudit(r: Record<string, unknown>): AuditLogRecord {
  return {
    id: Number(r.id),
    event: r.event as string,
    actorUserId: (r.actor_user_id as string) ?? null,
    actorUuid: (r.actor_uuid as string) ?? null,
    details: (r.details as Record<string, unknown>) ?? null,
    ipAddress: (r.ip_address as string) ?? null,
    createdAt: new Date(r.created_at as string),
  };
}

function mapVerification(r: Record<string, unknown>): VerificationTokenRecord {
  return {
    tokenHash: r.token_hash as string,
    transactionId: r.transaction_id as string,
    userId: r.user_id as string,
    expiresAt: new Date(r.expires_at as string),
    consumedAt: r.consumed_at ? new Date(r.consumed_at as string) : null,
    createdAt: new Date(r.created_at as string),
  };
}

function mapLevel(r: Record<string, unknown>): LevelRecord {
  return {
    id: Number(r.id),
    slug: r.slug as string,
    title: r.title as string,
    description: r.description as string,
    body: (r.body as LevelBody) ?? {},
    answers: (r.answers as string[]) ?? [],
    difficulty: Number(r.difficulty) as LevelDifficulty,
    puzzleType: r.puzzle_type as PuzzleType,
    orderIndex: Number(r.order_index),
    requiresLevelId: r.requires_level_id !== null ? Number(r.requires_level_id) : null,
    storyKey: (r.story_key as StoryKey) ?? null,
    storyReveal: (r.story_reveal as string) ?? null,
    active: Boolean(r.active),
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

function mapLevelHint(r: Record<string, unknown>): LevelHintRecord {
  return {
    id: Number(r.id),
    levelId: Number(r.level_id),
    position: Number(r.position),
    text: r.text as string,
  };
}

function mapLevelProgress(r: Record<string, unknown>): LevelProgressRecord {
  return {
    userId: r.user_id as string,
    levelId: Number(r.level_id),
    solved: Boolean(r.solved),
    attempts: Number(r.attempts),
    hintsUsed: Number(r.hints_used),
    solvedAt: r.solved_at ? new Date(r.solved_at as string) : null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

type Row = Record<string, unknown>;

// ---------- repositories ----------

class PgUserRepository implements UserRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { username: string; email: string; passwordHash: string; role: UserRecord['role'] }): Promise<UserRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.username, input.email, input.passwordHash, input.role]
    );
    return mapUser(rows[0]);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, id]);
  }

  async updateRole(id: string, role: 'user' | 'admin'): Promise<void> {
    await this.pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
  }

  async setLocked(id: string, locked: boolean, reason?: string): Promise<void> {
    await this.pool.query('UPDATE users SET locked = $1, locked_reason = $2, updated_at = NOW() WHERE id = $3', [locked, reason ?? null, id]);
  }

  async list(): Promise<UserRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(mapUser);
  }
}

class PgSessionRepository implements SessionRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { userId: string; tokenHash: string; ipAddress: string | null; userAgent: string | null; expiresAt: Date }): Promise<SessionRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES ($1, $2, $3::inet, $4, $5) RETURNING *`,
      [input.userId, input.tokenHash, input.ipAddress, input.userAgent, input.expiresAt]
    );
    return mapSession(rows[0]);
  }

  async findValidByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [tokenHash]
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [id]);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }

  async updateTokenHash(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query('UPDATE sessions SET token_hash = $1, rotated_at = NOW(), expires_at = $2 WHERE id = $3', [tokenHash, expiresAt, id]);
  }
}

class PgMinecraftLinkRepository implements MinecraftLinkRepository {
  constructor(private pool: pg.Pool) {}

  async upsert(input: { userId: string; minecraftUuid: string; minecraftUsername: string }): Promise<MinecraftLinkRecord> {
    const existing = await this.findByUuid(input.minecraftUuid);
    if (existing && existing.userId !== input.userId) throw new Error('MINECRAFT_ACCOUNT_ALREADY_LINKED');
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO minecraft_links (user_id, minecraft_uuid, minecraft_username)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET minecraft_uuid = EXCLUDED.minecraft_uuid, minecraft_username = EXCLUDED.minecraft_username, linked_at = NOW()
       RETURNING *`,
      [input.userId, input.minecraftUuid, input.minecraftUsername]
    );
    return mapLink(rows[0]);
  }

  async findByUserId(userId: string): Promise<MinecraftLinkRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM minecraft_links WHERE user_id = $1', [userId]);
    return rows[0] ? mapLink(rows[0]) : null;
  }

  async findByUuid(uuid: string): Promise<MinecraftLinkRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM minecraft_links WHERE minecraft_uuid = $1', [uuid]);
    return rows[0] ? mapLink(rows[0]) : null;
  }

  async updateLastVerified(userId: string): Promise<void> {
    await this.pool.query('UPDATE minecraft_links SET last_verified_at = NOW() WHERE user_id = $1', [userId]);
  }

  async resolveUsernameByUuid(uuid: string): Promise<string | null> {
    const { rows } = await this.pool.query<Row>('SELECT minecraft_username FROM minecraft_links WHERE minecraft_uuid = $1', [uuid]);
    return rows[0] ? (rows[0].minecraft_username as string) : null;
  }
}

class PgLinkChallengeRepository implements LinkChallengeRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { userId: string; challengeCode: string; pinHash: string; expiresAt: Date }): Promise<LinkChallengeRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO link_challenges (user_id, challenge_code, pin_hash, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.userId, input.challengeCode, input.pinHash, input.expiresAt]
    );
    return mapChallenge(rows[0]);
  }

  async findPendingByCode(code: string): Promise<LinkChallengeRecord | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM link_challenges WHERE challenge_code = $1 AND status = 'PENDING' AND expires_at > NOW()`,
      [code]
    );
    return rows[0] ? mapChallenge(rows[0]) : null;
  }

  async markConsumed(id: string): Promise<void> {
    await this.pool.query(`UPDATE link_challenges SET status = 'CONSUMED' WHERE id = $1`, [id]);
  }

  async markExpired(id: string): Promise<void> {
    await this.pool.query(`UPDATE link_challenges SET status = 'EXPIRED' WHERE id = $1`, [id]);
  }

  async markCancelledForUser(userId: string): Promise<void> {
    await this.pool.query(`UPDATE link_challenges SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'PENDING'`, [userId]);
  }
}

class PgTransactionRepository implements TransactionRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: {
    transactionNumber: string;
    amountCents: number;
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    description: string;
    status: TransactionRecord['status'];
    idempotencyKey: string | null;
    verificationTokenHash?: string | null;
    verificationExpiresAt?: Date | null;
  }): Promise<TransactionRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO transactions (transaction_number, amount_cents, from_uuid, from_name, to_uuid, to_name, description, status, idempotency_key, verification_token_hash, verification_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [input.transactionNumber, input.amountCents, input.fromUuid, input.fromName, input.toUuid, input.toName, input.description, input.status, input.idempotencyKey, input.verificationTokenHash ?? null, input.verificationExpiresAt ?? null]
    );
    return mapTransaction(rows[0]);
  }

  async findByNumber(number: string): Promise<TransactionRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM transactions WHERE transaction_number = $1', [number]);
    return rows[0] ? mapTransaction(rows[0]) : null;
  }

  async findById(id: string): Promise<TransactionRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM transactions WHERE id = $1', [id]);
    return rows[0] ? mapTransaction(rows[0]) : null;
  }

  async findByIdempotencyKey(key: string): Promise<TransactionRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM transactions WHERE idempotency_key = $1', [key]);
    return rows[0] ? mapTransaction(rows[0]) : null;
  }

  async updateStatus(id: string, status: TransactionRecord['status']): Promise<void> {
    await this.pool.query('UPDATE transactions SET status = $1 WHERE id = $2', [status, id]);
  }

  async markVerified(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query('UPDATE transactions SET verification_token_hash = $1, verification_expires_at = $2 WHERE id = $3', [tokenHash, expiresAt, id]);
  }

  async markPaid(id: string, tokenHash?: string): Promise<void> {
    await this.pool.query(
      `UPDATE transactions SET status = 'SUCCESS', paid_at = NOW(), verification_token_hash = COALESCE($1, verification_token_hash), verification_expires_at = NULL WHERE id = $2`,
      [tokenHash ?? null, id]
    );
  }

  async listForUuid(uuid: string, limit = 20): Promise<TransactionRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM transactions WHERE from_uuid = $1 OR to_uuid = $1 ORDER BY created_at DESC LIMIT $2',
      [uuid, limit]
    );
    return rows.map(mapTransaction);
  }

  async listByStatus(status: TransactionRecord['status'], limit = 50): Promise<TransactionRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM transactions WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit]
    );
    return rows.map(mapTransaction);
  }
}

class PgInvoiceRepository implements InvoiceRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: {
    invoiceNumber: string;
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    amountCents: number;
    description: string;
    expiresAt?: Date | null;
  }): Promise<InvoiceRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO invoices (invoice_number, from_uuid, from_name, to_uuid, to_name, amount_cents, description, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [input.invoiceNumber, input.fromUuid, input.fromName, input.toUuid, input.toName, input.amountCents, input.description, input.expiresAt ?? null]
    );
    return mapInvoice(rows[0]);
  }

  async findById(id: string): Promise<InvoiceRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM invoices WHERE id = $1', [id]);
    return rows[0] ? mapInvoice(rows[0]) : null;
  }

  async findByNumber(number: string): Promise<InvoiceRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM invoices WHERE invoice_number = $1', [number]);
    return rows[0] ? mapInvoice(rows[0]) : null;
  }

  async listForUuid(uuid: string, limit = 20): Promise<InvoiceRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM invoices WHERE from_uuid = $1 OR to_uuid = $1 ORDER BY created_at DESC LIMIT $2',
      [uuid, limit]
    );
    return rows.map(mapInvoice);
  }

  async listOpenForUuid(uuid: string): Promise<InvoiceRecord[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM invoices WHERE to_uuid = $1 AND status = 'OPEN' ORDER BY created_at DESC`,
      [uuid]
    );
    return rows.map(mapInvoice);
  }

  async updateStatus(id: string, status: InvoiceRecord['status']): Promise<void> {
    await this.pool.query('UPDATE invoices SET status = $1 WHERE id = $2', [status, id]);
  }

  async markPaid(id: string, transactionId: string): Promise<void> {
    await this.pool.query(`UPDATE invoices SET status = 'PAID', transaction_id = $1, paid_at = NOW() WHERE id = $2`, [transactionId, id]);
  }

  async listAll(limit = 50): Promise<InvoiceRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM invoices ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(mapInvoice);
  }
}

class PgTokenRepository implements TokenRepository {
  constructor(private pool: pg.Pool) {}

  async upsert(input: { tokenId: string; ownerUuid: string; valueCents: number; status: TokenRecord['status']; mobilityId?: string | null }): Promise<TokenRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO tokens (token_id, owner_uuid, value_cents, status, mobility_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token_id) DO UPDATE SET status = EXCLUDED.status, mobility_id = EXCLUDED.mobility_id RETURNING *`,
      [input.tokenId, input.ownerUuid, input.valueCents, input.status, input.mobilityId ?? null]
    );
    return mapToken(rows[0]);
  }

  async findById(tokenId: string): Promise<TokenRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM tokens WHERE token_id = $1', [tokenId]);
    return rows[0] ? mapToken(rows[0]) : null;
  }

  async findByMobilityId(mobilityId: string): Promise<TokenRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM tokens WHERE mobility_id = $1', [mobilityId]);
    return rows[0] ? mapToken(rows[0]) : null;
  }

  async setStatus(tokenId: string, status: TokenRecord['status']): Promise<void> {
    await this.pool.query('UPDATE tokens SET status = $1 WHERE token_id = $2', [status, tokenId]);
  }

  async markCopied(tokenId: string, copySourceToken: string): Promise<void> {
    await this.pool.query(`UPDATE tokens SET status = 'COPIED', copy_source_token = $1 WHERE token_id = $2`, [copySourceToken, tokenId]);
  }

  async markRedeemed(tokenId: string): Promise<void> {
    await this.pool.query(`UPDATE tokens SET status = 'REDEEMED', redeemed_at = NOW() WHERE token_id = $1`, [tokenId]);
  }

  async listAll(limit = 50): Promise<TokenRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM tokens ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(mapToken);
  }
}

class PgAuditLogRepository implements AuditLogRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { event: string; actorUserId?: string | null; actorUuid?: string | null; details?: Record<string, unknown> | null; ipAddress?: string | null }): Promise<AuditLogRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO audit_logs (event, actor_user_id, actor_uuid, details, ip_address) VALUES ($1, $2, $3, $4, $5::inet) RETURNING *`,
      [input.event, input.actorUserId ?? null, input.actorUuid ?? null, input.details ?? null, input.ipAddress ?? null]
    );
    return mapAudit(rows[0]);
  }

  async list(limit = 100, offset = 0): Promise<AuditLogRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows.map(mapAudit);
  }
}

class PgVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { tokenHash: string; transactionId: string; userId: string; expiresAt: Date }): Promise<VerificationTokenRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO verification_tokens (token_hash, transaction_id, user_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.tokenHash, input.transactionId, input.userId, input.expiresAt]
    );
    return mapVerification(rows[0]);
  }

  async findValidByHash(hash: string): Promise<VerificationTokenRecord | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM verification_tokens WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
      [hash]
    );
    return rows[0] ? mapVerification(rows[0]) : null;
  }

  async markConsumed(hash: string): Promise<void> {
    await this.pool.query(`UPDATE verification_tokens SET consumed_at = NOW() WHERE token_hash = $1`, [hash]);
  }
}

class PgLevelRepository implements LevelRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: {
    slug: string;
    title: string;
    description: string;
    body: LevelBody;
    answers: string[];
    difficulty: LevelDifficulty;
    puzzleType: PuzzleType;
    orderIndex: number;
    requiresLevelId: number | null;
    storyKey: StoryKey | null;
    storyReveal: string | null;
    active: boolean;
  }): Promise<LevelRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO levels (slug, title, description, body, answers, difficulty, puzzle_type, order_index, requires_level_id, story_key, story_reveal, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [input.slug, input.title, input.description, input.body, input.answers, input.difficulty, input.puzzleType, input.orderIndex, input.requiresLevelId, input.storyKey, input.storyReveal, input.active]
    );
    return mapLevel(rows[0]);
  }

  async findById(id: number): Promise<LevelRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM levels WHERE id = $1', [id]);
    return rows[0] ? mapLevel(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<LevelRecord | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM levels WHERE slug = $1', [slug]);
    return rows[0] ? mapLevel(rows[0]) : null;
  }

  async listAll(): Promise<LevelRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM levels ORDER BY order_index ASC');
    return rows.map(mapLevel);
  }

  async listActive(): Promise<LevelRecord[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM levels WHERE active = true ORDER BY order_index ASC');
    return rows.map(mapLevel);
  }

  async update(
    id: number,
    input: Partial<{
      title: string;
      description: string;
      body: LevelBody;
      answers: string[];
      difficulty: LevelDifficulty;
      puzzleType: PuzzleType;
      orderIndex: number;
      requiresLevelId: number | null;
      storyKey: StoryKey | null;
      storyReveal: string | null;
      active: boolean;
    }>
  ): Promise<LevelRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next = {
      ...existing,
      ...input,
      body: Object.assign({}, existing.body, input.body ?? {}),
    };
    const { rows } = await this.pool.query<Row>(
      `UPDATE levels SET title = $1, description = $2, body = $3, answers = $4, difficulty = $5, puzzle_type = $6, order_index = $7, requires_level_id = $8, story_key = $9, story_reveal = $10, active = $11, updated_at = NOW() WHERE id = $12 RETURNING *`,
      [next.title, next.description, next.body, next.answers, next.difficulty, next.puzzleType, next.orderIndex, next.requiresLevelId, next.storyKey, next.storyReveal, next.active, id]
    );
    return rows[0] ? mapLevel(rows[0]) : null;
  }

  async remove(id: number): Promise<void> {
    await this.pool.query('DELETE FROM levels WHERE id = $1', [id]);
  }

  async maxOrderIndex(): Promise<number> {
    const { rows } = await this.pool.query<{ m: number | null }>('SELECT MAX(order_index) AS m FROM levels');
    return rows[0]?.m ?? 0;
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ c: number }>('SELECT COUNT(*) AS c FROM levels');
    return Number(rows[0]?.c ?? 0);
  }
}

class PgLevelHintRepository implements LevelHintRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: { levelId: number; position: number; text: string }): Promise<LevelHintRecord> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO level_hints (level_id, position, text) VALUES ($1, $2, $3) RETURNING *`,
      [input.levelId, input.position, input.text]
    );
    return mapLevelHint(rows[0]);
  }

  async listForLevel(levelId: number): Promise<LevelHintRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM level_hints WHERE level_id = $1 ORDER BY position ASC',
      [levelId]
    );
    return rows.map(mapLevelHint);
  }

  async listForLevels(levelIds: number[]): Promise<LevelHintRecord[]> {
    if (levelIds.length === 0) return [];
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM level_hints WHERE level_id = ANY($1::int[]) ORDER BY level_id ASC, position ASC`,
      [levelIds]
    );
    return rows.map(mapLevelHint);
  }

  async deleteForLevel(levelId: number): Promise<void> {
    await this.pool.query('DELETE FROM level_hints WHERE level_id = $1', [levelId]);
  }
}

class PgLevelProgressRepository implements LevelProgressRepository {
  constructor(private pool: pg.Pool) {}

  async upsertAttempt(userId: string, levelId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used)
       VALUES ($1, $2, false, 1, 0)
       ON CONFLICT (user_id, level_id) DO UPDATE SET attempts = level_progress.attempts + 1, updated_at = NOW()`,
      [userId, levelId]
    );
  }

  async markSolved(userId: string, levelId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used, solved_at)
       VALUES ($1, $2, true, 1, 0, NOW())
       ON CONFLICT (user_id, level_id) DO UPDATE SET solved = true, solved_at = NOW(), updated_at = NOW()`,
      [userId, levelId]
    );
  }

  async get(userId: string, levelId: number): Promise<LevelProgressRecord | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM level_progress WHERE user_id = $1 AND level_id = $2',
      [userId, levelId]
    );
    return rows[0] ? mapLevelProgress(rows[0]) : null;
  }

  async listForUser(userId: string): Promise<LevelProgressRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM level_progress WHERE user_id = $1 ORDER BY level_id ASC',
      [userId]
    );
    return rows.map(mapLevelProgress);
  }

  async incrementHintsUsed(userId: string, levelId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used)
       VALUES ($1, $2, false, 0, 1)
       ON CONFLICT (user_id, level_id) DO UPDATE SET hints_used = level_progress.hints_used + 1, updated_at = NOW()`,
      [userId, levelId]
    );
  }

  async resetForUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM level_progress WHERE user_id = $1', [userId]);
  }
}

export function createPostgresDatabase(url: string): PostgresDatabase {
  return new PostgresDatabase(url);
}

export async function runMigrations(db: PostgresDatabase): Promise<void> {
  const initSql = readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf-8');
  await db.runMigration(initSql);
  const levelsSql = readFileSync(join(MIGRATIONS_DIR, '002_levels.sql'), 'utf-8');
  await db.runMigration(levelsSql);
}