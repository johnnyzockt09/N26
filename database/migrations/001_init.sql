-- ============================================================
-- N26 Minecraft Banking System - Database Schema
-- ============================================================
-- This database stores WEB-layer data only.
-- The Minecraft `storage server:bank` remains the source of
-- truth for virtual balances.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS minecraft_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minecraft_uuid UUID NOT NULL UNIQUE,
  minecraft_username VARCHAR(32) NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minecraft_links_uuid ON minecraft_links(minecraft_uuid);

CREATE TABLE IF NOT EXISTS link_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_code TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CONSUMED','EXPIRED','CANCELLED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_challenges_code ON link_challenges(challenge_code);
CREATE INDEX IF NOT EXISTS idx_link_challenges_expires ON link_challenges(expires_at);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number VARCHAR(24) NOT NULL UNIQUE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  from_uuid UUID NOT NULL,
  from_name VARCHAR(32) NOT NULL,
  to_uuid UUID NOT NULL,
  to_name VARCHAR(32) NOT NULL,
  description VARCHAR(200) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'SUCCESS','PENDING','PENDING_VERIFICATION','FAILED',
      'CANCELLED','EXPIRED','PENDING_RECONCILIATION'
    )),
  idempotency_key VARCHAR(64) UNIQUE,
  verification_token_hash TEXT,
  verification_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_idem ON transactions(idempotency_key);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(24) NOT NULL UNIQUE,
  from_uuid UUID NOT NULL,
  from_name VARCHAR(32) NOT NULL,
  to_uuid UUID NOT NULL,
  to_name VARCHAR(32) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  description VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','PAID','CANCELLED','EXPIRED')),
  expires_at TIMESTAMPTZ,
  transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_from ON invoices(from_uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_to ON invoices(to_uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  owner_uuid UUID NOT NULL,
  value_cents BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','REDEEMED','INVALIDATED','COPIED')),
  mobility_id VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  copy_source_token VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens(owner_uuid);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event VARCHAR(48) NOT NULL,
  actor_user_id UUID,
  actor_uuid UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token_hash TEXT PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_txn ON verification_tokens(transaction_id);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES ('system_name', 'N26 Minecraft Banking')
ON CONFLICT (key) DO NOTHING;