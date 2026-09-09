import { Database } from 'better-sqlite3';

export interface Db {
  raw: Database;
  user: {
    create(input: {
      username: string;
      email: string;
      passwordHash: string;
      role: 'user' | 'admin';
    }): UserRow;
    findByUsername(username: string): UserRow | undefined;
    findByEmail(email: string): UserRow | undefined;
    findById(id: string): UserRow | undefined;
    updatePassword(id: string, passwordHash: string): void;
    setLocked(id: string, locked: boolean, reason?: string): void;
  };
  session: {
    create(input: {
      userId: string;
      tokenHash: string;
      ipAddress?: string;
      userAgent?: string;
      expiresAt: string;
    }): SessionRow;
    findByToken(tokenHash: string): SessionRow | undefined;
    revoke(id: string): void;
    revokeAllForUser(userId: string): void;
    rotate(id: string, newTokenHash: string, expiresAt: string): void;
  };
  // ... (see below)
}

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  locked: boolean;
  locked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  rotated_at: string | null;
}

export interface MinecraftLinkRow {
  user_id: string;
  minecraft_uuid: string;
  minecraft_username: string;
  linked_at: string;
  last_verified_at: string;
}

export interface LinkChallengeRow {
  id: string;
  user_id: string;
  challenge_code: string;
  pin_hash: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';
  expires_at: string;
  created_at: string;
}

export interface TransactionRow {
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
}

export interface InvoiceRow {
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
}

export interface TokenRow {
  token_id: string;
  owner_uuid: string;
  value_cents: number;
  status: string;
  mobility_id: string | null;
  created_at: string;
  redeemed_at: string | null;
  copy_source_token: string | null;
}

export interface AuditLogRow {
  id: number;
  event: string;
  actor_user_id: string | null;
  actor_uuid: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
}

export interface VerificationTokenRow {
  token_hash: string;
  transaction_id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}