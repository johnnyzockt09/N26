import DatabaseConnection from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  locked INTEGER NOT NULL DEFAULT 0,
  locked_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS minecraft_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minecraft_uuid TEXT NOT NULL UNIQUE,
  minecraft_username TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS link_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_code TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONSUMED','EXPIRED','CANCELLED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_pending ON link_challenges(challenge_code);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_number TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  from_uuid TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_uuid TEXT NOT NULL,
  to_name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT UNIQUE,
  verification_token_hash TEXT,
  verification_expires_at TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_idem ON transactions(idempotency_key);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  from_uuid TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_uuid TEXT NOT NULL,
  to_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PAID','CANCELLED','EXPIRED')),
  expires_at TEXT,
  transaction_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_from ON invoices(from_uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_to ON invoices(to_uuid);

CREATE TABLE IF NOT EXISTS tokens (
  token_id TEXT PRIMARY KEY,
  owner_uuid TEXT NOT NULL,
  value_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REDEEMED','INVALIDATED','COPIED')),
  mobility_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  redeemed_at TEXT,
  copy_source_token TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  actor_user_id TEXT,
  actor_uuid TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token_hash TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '{}',
  answers TEXT NOT NULL DEFAULT '[]',
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  puzzle_type TEXT NOT NULL DEFAULT 'TEXT',
  order_index INTEGER NOT NULL,
  requires_level_id INTEGER,
  story_key TEXT,
  story_reveal TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_levels_order ON levels(order_index);

CREATE TABLE IF NOT EXISTS level_hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (level_id, position)
);

CREATE TABLE IF NOT EXISTS level_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  solved INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, level_id)
);
`;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: Record<string, unknown>): UserRecord {
    return {
      id: row.id as string,
      username: row.username as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      role: row.role as UserRecord['role'],
      locked: Boolean(row.locked),
      lockedReason: (row.locked_reason as string) ?? null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  async create(input: { username: string; email: string; passwordHash: string; role: 'user' | 'admin' }): Promise<UserRecord> {
    const id = crypto.randomUUID();
    const row = this.db.prepare(
      'INSERT INTO users (id, username, email, password_hash, role, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(id, input.username, input.email, input.passwordHash, input.role, nowIso(), nowIso());
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, nowIso(), id);
  }

  async updateRole(id: string, role: 'user' | 'admin'): Promise<void> {
    this.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), id);
  }

  async setLocked(id: string, locked: boolean, reason?: string): Promise<void> {
    this.db.prepare('UPDATE users SET locked = ?, locked_reason = ?, updated_at = ? WHERE id = ?').run(locked ? 1 : 0, reason ?? null, nowIso(), id);
  }

  async list(): Promise<UserRecord[]> {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    return rows.map((r) => this.map(r as Record<string, unknown>));
  }
}

class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: Record<string, unknown>): SessionRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      tokenHash: row.token_hash as string,
      ipAddress: (row.ip_address as string) ?? null,
      userAgent: (row.user_agent as string) ?? null,
      createdAt: new Date(row.created_at as string),
      expiresAt: new Date(row.expires_at as string),
      revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
      rotatedAt: row.rotated_at ? new Date(row.rotated_at as string) : null,
    };
  }

  async create(input: { userId: string; tokenHash: string; ipAddress: string | null; userAgent: string | null; expiresAt: Date }): Promise<SessionRecord> {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.userId, input.tokenHash, input.ipAddress, input.userAgent, nowIso(), input.expiresAt.toISOString());
    return (await this.findValidByTokenHash(input.tokenHash))!;
  }

  async findValidByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
    ).get(tokenHash, nowIso());
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async revoke(id: string): Promise<void> {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), id);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);
  }

  async updateTokenHash(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.db.prepare('UPDATE sessions SET token_hash = ?, rotated_at = ?, expires_at = ? WHERE id = ?').run(tokenHash, nowIso(), expiresAt.toISOString(), id);
  }
}

class SqliteMinecraftLinkRepository implements MinecraftLinkRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: Record<string, unknown>): MinecraftLinkRecord {
    return {
      userId: row.user_id as string,
      minecraftUuid: row.minecraft_uuid as string,
      minecraftUsername: row.minecraft_username as string,
      linkedAt: new Date(row.linked_at as string),
      lastVerifiedAt: new Date(row.last_verified_at as string),
    };
  }

  async upsert(input: { userId: string; minecraftUuid: string; minecraftUsername: string }): Promise<MinecraftLinkRecord> {
    const existingByUuid = await this.findByUuid(input.minecraftUuid);
    if (existingByUuid && existingByUuid.userId !== input.userId) {
      // A different web user already owns this Minecraft account
      throw new Error('MINECRAFT_ACCOUNT_ALREADY_LINKED');
    }
    this.db.prepare(
      `INSERT INTO minecraft_links (user_id, minecraft_uuid, minecraft_username, linked_at, last_verified_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET minecraft_uuid = excluded.minecraft_uuid, minecraft_username = excluded.minecraft_username, linked_at = excluded.linked_at, last_verified_at = excluded.last_verified_at`
    ).run(input.userId, input.minecraftUuid, input.minecraftUsername, nowIso(), nowIso());
    return (await this.findByUserId(input.userId))!;
  }

  async findByUserId(userId: string): Promise<MinecraftLinkRecord | null> {
    const row = this.db.prepare('SELECT * FROM minecraft_links WHERE user_id = ?').get(userId);
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async findByUuid(uuid: string): Promise<MinecraftLinkRecord | null> {
    const row = this.db.prepare('SELECT * FROM minecraft_links WHERE minecraft_uuid = ?').get(uuid);
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async updateLastVerified(userId: string): Promise<void> {
    this.db.prepare('UPDATE minecraft_links SET last_verified_at = ? WHERE user_id = ?').run(nowIso(), userId);
  }

  async resolveUsernameByUuid(uuid: string): Promise<string | null> {
    const row = this.db.prepare('SELECT minecraft_username FROM minecraft_links WHERE minecraft_uuid = ?').get(uuid) as { minecraft_username: string } | undefined;
    return row?.minecraft_username ?? null;
  }
}

class SqliteLinkChallengeRepository implements LinkChallengeRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: Record<string, unknown>): LinkChallengeRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      challengeCode: row.challenge_code as string,
      pinHash: row.pin_hash as string,
      status: row.status as LinkChallengeRecord['status'],
      expiresAt: new Date(row.expires_at as string),
      createdAt: new Date(row.created_at as string),
    };
  }

  async create(input: { userId: string; challengeCode: string; pinHash: string; expiresAt: Date }): Promise<LinkChallengeRecord> {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO link_challenges (id, user_id, challenge_code, pin_hash, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.userId, input.challengeCode, input.pinHash, 'PENDING', input.expiresAt.toISOString(), nowIso());
    return (await this.findPendingByCode(input.challengeCode))!;
  }

  async findPendingByCode(code: string): Promise<LinkChallengeRecord | null> {
    const row = this.db.prepare(
      'SELECT * FROM link_challenges WHERE challenge_code = ? AND status = ? AND expires_at > ?'
    ).get(code, 'PENDING', nowIso());
    return row ? this.map(row as Record<string, unknown>) : null;
  }

  async markConsumed(id: string): Promise<void> {
    this.db.prepare('UPDATE link_challenges SET status = ? WHERE id = ?').run('CONSUMED', id);
  }

  async markExpired(id: string): Promise<void> {
    this.db.prepare('UPDATE link_challenges SET status = ? WHERE id = ?').run('EXPIRED', id);
  }

  async markCancelledForUser(userId: string): Promise<void> {
    this.db.prepare('UPDATE link_challenges SET status = ? WHERE user_id = ? AND status = ?').run('CANCELLED', userId, 'PENDING');
  }
}

type TransactionRow = Record<string, unknown> & {
  id: string;
  transaction_number: string;
  amount_cents: number;
  from_uuid: string;
  from_name: string;
  to_uuid: string;
  to_name: string;
  description: string;
  status: string;
  idempotency_key: string | null;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  created_at: string;
  paid_at: string | null;
};

class SqliteTransactionRepository implements TransactionRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: TransactionRow): TransactionRecord {
    return {
      id: row.id,
      transactionNumber: row.transaction_number,
      amountCents: row.amount_cents,
      fromUuid: row.from_uuid,
      fromName: row.from_name,
      toUuid: row.to_uuid,
      toName: row.to_name,
      description: row.description,
      status: row.status as TransactionRecord['status'],
      idempotencyKey: row.idempotency_key,
      verificationTokenHash: row.verification_token_hash,
      verificationExpiresAt: row.verification_expires_at ? new Date(row.verification_expires_at) : null,
      createdAt: new Date(row.created_at),
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
    };
  }

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
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO transactions (id, transaction_number, amount_cents, from_uuid, from_name, to_uuid, to_name, description, status, idempotency_key, verification_token_hash, verification_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.transactionNumber, input.amountCents, input.fromUuid, input.fromName,
      input.toUuid, input.toName, input.description, input.status, input.idempotencyKey,
      input.verificationTokenHash ?? null, input.verificationExpiresAt ? input.verificationExpiresAt.toISOString() : null, nowIso()
    );
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as TransactionRow;
    return this.map(row);
  }

  async findByNumber(number: string): Promise<TransactionRecord | null> {
    const row = this.db.prepare('SELECT * FROM transactions WHERE transaction_number = ?').get(number) as TransactionRow | undefined;
    return row ? this.map(row) : null;
  }

  async findById(id: string): Promise<TransactionRecord | null> {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as TransactionRow | undefined;
    return row ? this.map(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<TransactionRecord | null> {
    const row = this.db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(key) as TransactionRow | undefined;
    return row ? this.map(row) : null;
  }

  async updateStatus(id: string, status: TransactionRecord['status']): Promise<void> {
    this.db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, id);
  }

  async markVerified(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.db.prepare('UPDATE transactions SET verification_token_hash = ?, verification_expires_at = ? WHERE id = ?').run(tokenHash, expiresAt.toISOString(), id);
  }

  async markPaid(id: string, tokenHash?: string): Promise<void> {
    this.db.prepare('UPDATE transactions SET status = ?, paid_at = ?, verification_token_hash = COALESCE(?, verification_token_hash), verification_expires_at = NULL WHERE id = ?').run('SUCCESS', nowIso(), tokenHash ?? null, id);
  }

  async listForUuid(uuid: string, limit = 20): Promise<TransactionRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM transactions WHERE from_uuid = ? OR to_uuid = ? ORDER BY created_at DESC LIMIT ?'
    ).all(uuid, uuid, limit) as TransactionRow[];
    return rows.map((r) => this.map(r));
  }

  async listByStatus(status: TransactionRecord['status'], limit = 50): Promise<TransactionRecord[]> {
    const rows = this.db.prepare('SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit) as TransactionRow[];
    return rows.map((r) => this.map(r));
  }
}

type InvoiceRow = Record<string, unknown> & {
  id: string;
  invoice_number: string;
  from_uuid: string;
  from_name: string;
  to_uuid: string;
  to_name: string;
  amount_cents: number;
  description: string;
  status: string;
  expires_at: string | null;
  transaction_id: string | null;
  created_at: string;
  paid_at: string | null;
};

class SqliteInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: InvoiceRow): InvoiceRecord {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      fromUuid: row.from_uuid,
      fromName: row.from_name,
      toUuid: row.to_uuid,
      toName: row.to_name,
      amountCents: row.amount_cents,
      description: row.description,
      status: row.status as InvoiceRecord['status'],
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      transactionId: row.transaction_id,
      createdAt: new Date(row.created_at),
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
    };
  }

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
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO invoices (id, invoice_number, from_uuid, from_name, to_uuid, to_name, amount_cents, description, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, input.invoiceNumber, input.fromUuid, input.fromName, input.toUuid, input.toName,
      input.amountCents, input.description, 'OPEN', input.expiresAt ? input.expiresAt.toISOString() : null, nowIso()
    );
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow;
    return this.map(row);
  }

  async findById(id: string): Promise<InvoiceRecord | null> {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
    return row ? this.map(row) : null;
  }

  async findByNumber(number: string): Promise<InvoiceRecord | null> {
    const row = this.db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(number) as InvoiceRow | undefined;
    return row ? this.map(row) : null;
  }

  async listForUuid(uuid: string, limit = 20): Promise<InvoiceRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM invoices WHERE from_uuid = ? OR to_uuid = ? ORDER BY created_at DESC LIMIT ?'
    ).all(uuid, uuid, limit) as InvoiceRow[];
    return rows.map((r) => this.map(r));
  }

  async listOpenForUuid(uuid: string): Promise<InvoiceRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM invoices WHERE to_uuid = ? AND status = ? ORDER BY created_at DESC'
    ).all(uuid, 'OPEN') as InvoiceRow[];
    return rows.map((r) => this.map(r));
  }

  async updateStatus(id: string, status: InvoiceRecord['status']): Promise<void> {
    this.db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id);
  }

  async markPaid(id: string, transactionId: string): Promise<void> {
    this.db.prepare('UPDATE invoices SET status = ?, transaction_id = ?, paid_at = ? WHERE id = ?').run('PAID', transactionId, nowIso(), id);
  }

  async listAll(limit = 50): Promise<InvoiceRecord[]> {
    const rows = this.db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?').all(limit) as InvoiceRow[];
    return rows.map((r) => this.map(r));
  }
}

type TokenRow = Record<string, unknown> & {
  token_id: string;
  owner_uuid: string;
  value_cents: number;
  status: string;
  mobility_id: string | null;
  created_at: string;
  redeemed_at: string | null;
  copy_source_token: string | null;
};

class SqliteTokenRepository implements TokenRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: TokenRow): TokenRecord {
    return {
      tokenId: row.token_id,
      ownerUuid: row.owner_uuid,
      valueCents: row.value_cents,
      status: row.status as TokenRecord['status'],
      mobilityId: row.mobility_id,
      createdAt: new Date(row.created_at),
      redeemedAt: row.redeemed_at ? new Date(row.redeemed_at) : null,
      copySourceToken: row.copy_source_token,
    };
  }

  async upsert(input: {
    tokenId: string;
    ownerUuid: string;
    valueCents: number;
    status: TokenRecord['status'];
    mobilityId?: string | null;
  }): Promise<TokenRecord> {
    this.db.prepare(
      `INSERT INTO tokens (token_id, owner_uuid, value_cents, status, mobility_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_id) DO UPDATE SET status = excluded.status, mobility_id = excluded.mobility_id`
    ).run(input.tokenId, input.ownerUuid, input.valueCents, input.status, input.mobilityId ?? null, nowIso());
    const row = this.db.prepare('SELECT * FROM tokens WHERE token_id = ?').get(input.tokenId) as TokenRow;
    return this.map(row);
  }

  async findById(tokenId: string): Promise<TokenRecord | null> {
    const row = this.db.prepare('SELECT * FROM tokens WHERE token_id = ?').get(tokenId) as TokenRow | undefined;
    return row ? this.map(row) : null;
  }

  async findByMobilityId(mobilityId: string): Promise<TokenRecord | null> {
    const row = this.db.prepare('SELECT * FROM tokens WHERE mobility_id = ?').get(mobilityId) as TokenRow | undefined;
    return row ? this.map(row) : null;
  }

  async setStatus(tokenId: string, status: TokenRecord['status']): Promise<void> {
    this.db.prepare('UPDATE tokens SET status = ? WHERE token_id = ?').run(status, tokenId);
  }

  async markCopied(tokenId: string, copySourceToken: string): Promise<void> {
    this.db.prepare('UPDATE tokens SET status = ?, copy_source_token = ? WHERE token_id = ?').run('COPIED', copySourceToken, tokenId);
  }

  async markRedeemed(tokenId: string): Promise<void> {
    this.db.prepare('UPDATE tokens SET status = ?, redeemed_at = ? WHERE token_id = ?').run('REDEEMED', nowIso(), tokenId);
  }

  async listAll(limit = 50): Promise<TokenRecord[]> {
    const rows = this.db.prepare('SELECT * FROM tokens ORDER BY created_at DESC LIMIT ?').all(limit) as TokenRow[];
    return rows.map((r) => this.map(r));
  }
}

type AuditRow = Record<string, unknown> & {
  id: number;
  event: string;
  actor_user_id: string | null;
  actor_uuid: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
};

class SqliteAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: AuditRow): AuditLogRecord {
    return {
      id: row.id,
      event: row.event,
      actorUserId: row.actor_user_id,
      actorUuid: row.actor_uuid,
      details: parseJson<Record<string, unknown>>(row.details),
      ipAddress: row.ip_address,
      createdAt: new Date(row.created_at),
    };
  }

  async create(input: { event: string; actorUserId?: string | null; actorUuid?: string | null; details?: Record<string, unknown> | null; ipAddress?: string | null }): Promise<AuditLogRecord> {
    const result = this.db.prepare(
      'INSERT INTO audit_logs (event, actor_user_id, actor_uuid, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      input.event, input.actorUserId ?? null, input.actorUuid ?? null,
      input.details ? JSON.stringify(input.details) : null, input.ipAddress ?? null, nowIso()
    );
    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(result.lastInsertRowid) as AuditRow;
    return this.map(row);
  }

  async list(limit = 100, offset = 0): Promise<AuditLogRecord[]> {
    const rows = this.db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as AuditRow[];
    return rows.map((r) => this.map(r));
  }
}

type VerificationRow = Record<string, unknown> & {
  token_hash: string;
  transaction_id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

class SqliteVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: VerificationRow): VerificationTokenRecord {
    return {
      tokenHash: row.token_hash,
      transactionId: row.transaction_id,
      userId: row.user_id,
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  async create(input: { tokenHash: string; transactionId: string; userId: string; expiresAt: Date }): Promise<VerificationTokenRecord> {
    this.db.prepare(
      'INSERT INTO verification_tokens (token_hash, transaction_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(input.tokenHash, input.transactionId, input.userId, input.expiresAt.toISOString(), nowIso());
    const row = this.db.prepare('SELECT * FROM verification_tokens WHERE token_hash = ?').get(input.tokenHash) as VerificationRow;
    return this.map(row);
  }

  async findValidByHash(hash: string): Promise<VerificationTokenRecord | null> {
    const row = this.db.prepare(
      'SELECT * FROM verification_tokens WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?'
    ).get(hash, nowIso()) as VerificationRow | undefined;
    return row ? this.map(row) : null;
  }

  async markConsumed(hash: string): Promise<void> {
    this.db.prepare('UPDATE verification_tokens SET consumed_at = ? WHERE token_hash = ?').run(nowIso(), hash);
  }
}

type LevelRow = Record<string, unknown> & {
  id: number;
  slug: string;
  title: string;
  description: string;
  body: string;
  answers: string;
  difficulty: number;
  puzzle_type: string;
  order_index: number;
  requires_level_id: number | null;
  story_key: string | null;
  story_reveal: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

class SqliteLevelRepository implements LevelRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: LevelRow): LevelRecord {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      body: parseJson<LevelBody>(row.body) ?? {},
      answers: parseJson<string[]>(row.answers) ?? [],
      difficulty: row.difficulty as LevelDifficulty,
      puzzleType: row.puzzle_type as PuzzleType,
      orderIndex: row.order_index,
      requiresLevelId: row.requires_level_id,
      storyKey: row.story_key as StoryKey | null,
      storyReveal: row.story_reveal,
      active: Boolean(row.active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

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
    const result = this.db.prepare(
      `INSERT INTO levels (slug, title, description, body, answers, difficulty, puzzle_type, order_index, requires_level_id, story_key, story_reveal, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.slug, input.title, input.description,
      JSON.stringify(input.body), JSON.stringify(input.answers),
      input.difficulty, input.puzzleType, input.orderIndex,
      input.requiresLevelId, input.storyKey, input.storyReveal,
      input.active ? 1 : 0, nowIso(), nowIso()
    );
    const row = this.db.prepare('SELECT * FROM levels WHERE id = ?').get(result.lastInsertRowid) as LevelRow;
    return this.map(row);
  }

  async findById(id: number): Promise<LevelRecord | null> {
    const row = this.db.prepare('SELECT * FROM levels WHERE id = ?').get(id) as LevelRow | undefined;
    return row ? this.map(row) : null;
  }

  async findBySlug(slug: string): Promise<LevelRecord | null> {
    const row = this.db.prepare('SELECT * FROM levels WHERE slug = ?').get(slug) as LevelRow | undefined;
    return row ? this.map(row) : null;
  }

  async listAll(): Promise<LevelRecord[]> {
    const rows = this.db.prepare('SELECT * FROM levels ORDER BY order_index ASC').all() as LevelRow[];
    return rows.map((r) => this.map(r));
  }

  async listActive(): Promise<LevelRecord[]> {
    const rows = this.db.prepare('SELECT * FROM levels WHERE active = 1 ORDER BY order_index ASC').all() as LevelRow[];
    return rows.map((r) => this.map(r));
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
    const next: LevelRecord = {
      ...existing,
      ...input,
      body: Object.assign({}, existing.body, input.body ?? {}),
      answers: input.answers ?? existing.answers,
      difficulty: input.difficulty ?? existing.difficulty,
      puzzleType: input.puzzleType ?? existing.puzzleType,
      orderIndex: input.orderIndex ?? existing.orderIndex,
      requiresLevelId: input.requiresLevelId !== undefined ? input.requiresLevelId : existing.requiresLevelId,
      storyKey: input.storyKey !== undefined ? input.storyKey : existing.storyKey,
      storyReveal: input.storyReveal !== undefined ? input.storyReveal : existing.storyReveal,
      active: input.active ?? existing.active,
    };
    this.db.prepare(
      `UPDATE levels SET slug = ?, title = ?, description = ?, body = ?, answers = ?, difficulty = ?, puzzle_type = ?, order_index = ?, requires_level_id = ?, story_key = ?, story_reveal = ?, active = ?, updated_at = ? WHERE id = ?`
    ).run(
      next.slug, next.title, next.description,
      JSON.stringify(next.body), JSON.stringify(next.answers),
      next.difficulty, next.puzzleType, next.orderIndex,
      next.requiresLevelId, next.storyKey, next.storyReveal,
      next.active ? 1 : 0, nowIso(), id
    );
    return this.findById(id);
  }

  async remove(id: number): Promise<void> {
    this.db.prepare('DELETE FROM levels WHERE id = ?').run(id);
  }

  async maxOrderIndex(): Promise<number> {
    const row = this.db.prepare('SELECT MAX(order_index) AS m FROM levels').get() as { m: number | null };
    return row.m ?? 0;
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM levels').get() as { c: number };
    return row.c;
  }
}

type LevelHintRow = Record<string, unknown> & {
  id: number;
  level_id: number;
  position: number;
  text: string;
};

class SqliteLevelHintRepository implements LevelHintRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: LevelHintRow): LevelHintRecord {
    return { id: row.id, levelId: row.level_id, position: row.position, text: row.text };
  }

  async create(input: { levelId: number; position: number; text: string }): Promise<LevelHintRecord> {
    const result = this.db.prepare(
      'INSERT INTO level_hints (level_id, position, text) VALUES (?, ?, ?)'
    ).run(input.levelId, input.position, input.text);
    const row = this.db.prepare('SELECT * FROM level_hints WHERE id = ?').get(result.lastInsertRowid) as LevelHintRow;
    return this.map(row);
  }

  async listForLevel(levelId: number): Promise<LevelHintRecord[]> {
    const rows = this.db.prepare('SELECT * FROM level_hints WHERE level_id = ? ORDER BY position ASC').all(levelId) as LevelHintRow[];
    return rows.map((r) => this.map(r));
  }

  async listForLevels(levelIds: number[]): Promise<LevelHintRecord[]> {
    if (levelIds.length === 0) return [];
    const placeholders = levelIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT * FROM level_hints WHERE level_id IN (${placeholders}) ORDER BY level_id ASC, position ASC`
    ).all(...levelIds) as LevelHintRow[];
    return rows.map((r) => this.map(r));
  }

  async deleteForLevel(levelId: number): Promise<void> {
    this.db.prepare('DELETE FROM level_hints WHERE level_id = ?').run(levelId);
  }
}

type LevelProgressRow = Record<string, unknown> & {
  user_id: string;
  level_id: number;
  solved: number;
  attempts: number;
  hints_used: number;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
};

class SqliteLevelProgressRepository implements LevelProgressRepository {
  constructor(private readonly db: DatabaseConnection.Database) {}

  private map(row: LevelProgressRow): LevelProgressRecord {
    return {
      userId: row.user_id,
      levelId: row.level_id,
      solved: Boolean(row.solved),
      attempts: row.attempts,
      hintsUsed: row.hints_used,
      solvedAt: row.solved_at ? new Date(row.solved_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async upsertAttempt(userId: string, levelId: number): Promise<void> {
    this.db.prepare(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used, created_at, updated_at)
       VALUES (?, ?, 0, 1, 0, ?, ?)
       ON CONFLICT(user_id, level_id) DO UPDATE SET attempts = attempts + 1, updated_at = excluded.updated_at`
    ).run(userId, levelId, nowIso(), nowIso());
  }

  async markSolved(userId: string, levelId: number): Promise<void> {
    this.db.prepare(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used, solved_at, created_at, updated_at)
       VALUES (?, ?, 1, 1, 0, ?, ?, ?)
       ON CONFLICT(user_id, level_id) DO UPDATE SET solved = 1, solved_at = excluded.solved_at, updated_at = excluded.updated_at`
    ).run(userId, levelId, nowIso(), nowIso(), nowIso());
  }

  async get(userId: string, levelId: number): Promise<LevelProgressRecord | null> {
    const row = this.db.prepare(
      'SELECT * FROM level_progress WHERE user_id = ? AND level_id = ?'
    ).get(userId, levelId) as LevelProgressRow | undefined;
    return row ? this.map(row) : null;
  }

  async listForUser(userId: string): Promise<LevelProgressRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM level_progress WHERE user_id = ? ORDER BY level_id ASC'
    ).all(userId) as LevelProgressRow[];
    return rows.map((r) => this.map(r));
  }

  async incrementHintsUsed(userId: string, levelId: number): Promise<void> {
    this.db.prepare(
      `INSERT INTO level_progress (user_id, level_id, solved, attempts, hints_used, created_at, updated_at)
       VALUES (?, ?, 0, 0, 1, ?, ?)
       ON CONFLICT(user_id, level_id) DO UPDATE SET hints_used = hints_used + 1, updated_at = excluded.updated_at`
    ).run(userId, levelId, nowIso(), nowIso());
  }

  async resetForUser(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM level_progress WHERE user_id = ?').run(userId);
  }
}

export class SqliteDatabase implements Database {
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

  constructor(filePath = ':memory:') {
    if (filePath !== ':memory:') {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    const db = new DatabaseConnection(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    this.raw = db;
    this.users = new SqliteUserRepository(db);
    this.sessions = new SqliteSessionRepository(db);
    this.links = new SqliteMinecraftLinkRepository(db);
    this.linkChallenges = new SqliteLinkChallengeRepository(db);
    this.transactions = new SqliteTransactionRepository(db);
    this.invoices = new SqliteInvoiceRepository(db);
    this.tokens = new SqliteTokenRepository(db);
    this.auditLogs = new SqliteAuditLogRepository(db);
    this.verificationTokens = new SqliteVerificationTokenRepository(db);
    this.levels = new SqliteLevelRepository(db);
    this.levelHints = new SqliteLevelHintRepository(db);
    this.levelProgress = new SqliteLevelProgressRepository(db);
  }

  raw: DatabaseConnection.Database;

  async ping(): Promise<boolean> {
    try {
      this.raw.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.raw.close();
  }
}

export function createDatabase(url: string): Database & { close: () => void } {
  if (url.startsWith('sqlite')) {
    const path = url.replace(/^sqlite:/, '');
    return new SqliteDatabase(path === '' ? ':memory:' : path);
  }
  // Bootstrap: without a real DATABASE_URL pointing at Postgres we default to
  // SQLite so the system can boot for development/tests.
  return new SqliteDatabase();
}