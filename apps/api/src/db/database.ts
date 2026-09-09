/**
 * Database interface - the web layer's data store.
 *
 * This DB stores WEB-LAYER data only (users, sessions, links,
 * transactions, invoices, tokens, audit logs). It never stores
 * or replaces the authoritative Minecraft bank data which lives
 * in `storage server:bank` inside the Minecraft server.
 */
export interface Database {
  users: UserRepository;
  sessions: SessionRepository;
  links: MinecraftLinkRepository;
  linkChallenges: LinkChallengeRepository;
  transactions: TransactionRepository;
  invoices: InvoiceRepository;
  tokens: TokenRepository;
  auditLogs: AuditLogRepository;
  verificationTokens: VerificationTokenRepository;
  levels: LevelRepository;
  levelHints: LevelHintRepository;
  levelProgress: LevelProgressRepository;
  ping(): Promise<boolean>;
}

export type Role = 'user' | 'admin';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: Role;
  locked: boolean;
  lockedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
}

export interface MinecraftLinkRecord {
  userId: string;
  minecraftUuid: string;
  minecraftUsername: string;
  linkedAt: Date;
  lastVerifiedAt: Date;
}

export interface LinkChallengeRecord {
  id: string;
  userId: string;
  challengeCode: string;
  pinHash: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: Date;
  createdAt: Date;
}

export type TransactionStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PENDING_RECONCILIATION';

export interface TransactionRecord {
  id: string;
  transactionNumber: string;
  amountCents: number;
  fromUuid: string;
  fromName: string;
  toUuid: string;
  toName: string;
  description: string;
  status: TransactionStatus;
  idempotencyKey: string | null;
  verificationTokenHash: string | null;
  verificationExpiresAt: Date | null;
  createdAt: Date;
  paidAt: Date | null;
}

export type InvoiceStatus = 'OPEN' | 'PAID' | 'CANCELLED' | 'EXPIRED';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  fromUuid: string;
  fromName: string;
  toUuid: string;
  toName: string;
  amountCents: number;
  description: string;
  status: InvoiceStatus;
  expiresAt: Date | null;
  transactionId: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

export type TokenStatus = 'ACTIVE' | 'REDEEMED' | 'INVALIDATED' | 'COPIED';

export interface TokenRecord {
  tokenId: string;
  ownerUuid: string;
  valueCents: number;
  status: TokenStatus;
  mobilityId: string | null;
  createdAt: Date;
  redeemedAt: Date | null;
  copySourceToken: string | null;
}

export interface AuditLogRecord {
  id: number;
  event: string;
  actorUserId: string | null;
  actorUuid: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface VerificationTokenRecord {
  tokenHash: string;
  transactionId: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

// ------------------------------------------------------------------
// Levels (UNKNOWN WORLD puzzle game)
// ------------------------------------------------------------------

export type PuzzleType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'FILE'
  | 'URL'
  | 'CODE'
  | 'META'
  | 'MIXED';

export type LevelDifficulty = 1 | 2 | 3 | 4 | 5;

export type StoryKey = 'UNKNOWN' | 'PROJECT_NULL' | 'WORLD_01' | 'WORLD_02' | 'WORLD_03';

export interface LevelBody {
  text?: string;
  code?: string;
  image?: string | null;
  audio?: string | null;
  file?: string | null;
  extra?: Record<string, string> | null;
}

export interface LevelRecord {
  id: number;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface LevelHintRecord {
  id: number;
  levelId: number;
  position: number;
  text: string;
}

export interface LevelProgressRecord {
  userId: string;
  levelId: number;
  solved: boolean;
  attempts: number;
  hintsUsed: number;
  solvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LevelRepository {
  create(input: {
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
  }): Promise<LevelRecord>;
  findById(id: number): Promise<LevelRecord | null>;
  findBySlug(slug: string): Promise<LevelRecord | null>;
  listAll(): Promise<LevelRecord[]>;
  listActive(): Promise<LevelRecord[]>;
  update(
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
  ): Promise<LevelRecord | null>;
  remove(id: number): Promise<void>;
  maxOrderIndex(): Promise<number>;
  count(): Promise<number>;
}

export interface LevelHintRepository {
  create(input: { levelId: number; position: number; text: string }): Promise<LevelHintRecord>;
  listForLevel(levelId: number): Promise<LevelHintRecord[]>;
  listForLevels(levelIds: number[]): Promise<LevelHintRecord[]>;
  deleteForLevel(levelId: number): Promise<void>;
}

export interface LevelProgressRepository {
  upsertAttempt(userId: string, levelId: number): Promise<void>;
  markSolved(userId: string, levelId: number): Promise<void>;
  get(userId: string, levelId: number): Promise<LevelProgressRecord | null>;
  listForUser(userId: string): Promise<LevelProgressRecord[]>;
  incrementHintsUsed(userId: string, levelId: number): Promise<void>;
  resetForUser(userId: string): Promise<void>;
}

export interface UserRepository {
  create(input: {
    username: string;
    email: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  updateRole(id: string, role: Role): Promise<void>;
  setLocked(id: string, locked: boolean, reason?: string): Promise<void>;
  list(): Promise<UserRecord[]>;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findValidByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  updateTokenHash(id: string, tokenHash: string, expiresAt: Date): Promise<void>;
}

export interface MinecraftLinkRepository {
  upsert(input: {
    userId: string;
    minecraftUuid: string;
    minecraftUsername: string;
  }): Promise<MinecraftLinkRecord>;
  findByUserId(userId: string): Promise<MinecraftLinkRecord | null>;
  findByUuid(uuid: string): Promise<MinecraftLinkRecord | null>;
  updateLastVerified(userId: string): Promise<void>;
  resolveUsernameByUuid(uuid: string): Promise<string | null>;
}

export interface LinkChallengeRepository {
  create(input: {
    userId: string;
    challengeCode: string;
    pinHash: string;
    expiresAt: Date;
  }): Promise<LinkChallengeRecord>;
  findPendingByCode(challengeCode: string): Promise<LinkChallengeRecord | null>;
  markConsumed(id: string): Promise<void>;
  markExpired(id: string): Promise<void>;
  markCancelledForUser(userId: string): Promise<void>;
}

export interface TransactionRepository {
  create(input: {
    transactionNumber: string;
    amountCents: number;
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    description: string;
    status: TransactionStatus;
    idempotencyKey: string | null;
    verificationTokenHash?: string | null;
    verificationExpiresAt?: Date | null;
  }): Promise<TransactionRecord>;
  findByNumber(transactionNumber: string): Promise<TransactionRecord | null>;
  findById(id: string): Promise<TransactionRecord | null>;
  findByIdempotencyKey(key: string): Promise<TransactionRecord | null>;
  updateStatus(id: string, status: TransactionStatus): Promise<void>;
  markVerified(id: string, tokenHash: string, expiresAt: Date): Promise<void>;
  markPaid(id: string, tokenHash?: string): Promise<void>;
  listForUuid(uuid: string, limit?: number): Promise<TransactionRecord[]>;
  listByStatus(status: TransactionStatus, limit?: number): Promise<TransactionRecord[]>;
}

export interface InvoiceRepository {
  create(input: {
    invoiceNumber: string;
    fromUuid: string;
    fromName: string;
    toUuid: string;
    toName: string;
    amountCents: number;
    description: string;
    expiresAt?: Date | null;
  }): Promise<InvoiceRecord>;
  findById(id: string): Promise<InvoiceRecord | null>;
  findByNumber(invoiceNumber: string): Promise<InvoiceRecord | null>;
  listForUuid(uuid: string, limit?: number): Promise<InvoiceRecord[]>;
  listOpenForUuid(uuid: string): Promise<InvoiceRecord[]>;
  updateStatus(id: string, status: InvoiceStatus): Promise<void>;
  markPaid(id: string, transactionId: string): Promise<void>;
  listAll(limit?: number): Promise<InvoiceRecord[]>;
}

export interface TokenRepository {
  upsert(input: {
    tokenId: string;
    ownerUuid: string;
    valueCents: number;
    status: TokenStatus;
    mobilityId?: string | null;
  }): Promise<TokenRecord>;
  findById(tokenId: string): Promise<TokenRecord | null>;
  findByMobilityId(mobilityId: string): Promise<TokenRecord | null>;
  setStatus(tokenId: string, status: TokenStatus): Promise<void>;
  markCopied(tokenId: string, copySourceToken: string): Promise<void>;
  markRedeemed(tokenId: string): Promise<void>;
  listAll(limit?: number): Promise<TokenRecord[]>;
}

export interface AuditLogRepository {
  create(input: {
    event: string;
    actorUserId?: string | null;
    actorUuid?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<AuditLogRecord>;
  list(limit?: number, offset?: number): Promise<AuditLogRecord[]>;
}

export interface VerificationTokenRepository {
  create(input: {
    tokenHash: string;
    transactionId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord>;
  findValidByHash(tokenHash: string): Promise<VerificationTokenRecord | null>;
  markConsumed(tokenHash: string): Promise<void>;
}