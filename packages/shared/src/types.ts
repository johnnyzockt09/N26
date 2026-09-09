export const N26_SYSTEM_VERSION = '1.0.0';

/**
 * All monetary values are stored as integer cents.
 * 100 EUR = 10000 cents.
 * NEVER use floating point for money.
 */
export type Cents = number;

export const TRANSFER_LIMIT_CENTS = 10_000; // 100.00 EUR
export const MAX_TRANSACTION_CENTS = 100_000_000; // 1.000.000 EUR sanity cap

export type TransactionStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PENDING_RECONCILIATION';

export type AccountStatus = 'ACTIVE' | 'LOCKED';

export type InvoiceStatus = 'OPEN' | 'PAID' | 'CANCELLED' | 'EXPIRED';

export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING';

export type AuditEvent =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'REGISTER'
  | 'ACCOUNT_LINK'
  | 'TRANSFER'
  | 'TRANSFER_VERIFY'
  | 'INVOICE_CREATE'
  | 'INVOICE_PAY'
  | 'PAYMENT_VERIFY'
  | 'PAYMENT_VERIFY_FAIL'
  | 'TOKEN_CREATE'
  | 'TOKEN_REDEEM'
  | 'TOKEN_COPY_DETECTED'
  | 'ACCOUNT_LOCK'
  | 'ACCOUNT_UNLOCK'
  | 'ACCOUNT_KICK'
  | 'RCON_ERROR'
  | 'PASSWORD_CHANGE'
  | 'SESSION_INVALIDATE'
  | 'LEVEL_SOLVE'
  | 'LEVEL_ATTEMPT'
  | 'LEVEL_HINT'
  | 'LEVEL_RESET'
  | 'LEVEL_CREATE'
  | 'LEVEL_UPDATE'
  | 'LEVEL_DELETE';

export interface MinecraftAccount {
  uuid: string;
  username: string;
  registered: boolean;
  accountOk: boolean;
  status: AccountStatus;
  /** Integer cents – computed by the data pack as Money - Key */
  balance: number;
  payOut: boolean;
  vault: boolean;
}

export interface Transaction {
  id: string;
  amount: Cents;
  fromUuid: string;
  fromName: string;
  toUuid: string;
  toName: string;
  description: string;
  status: TransactionStatus;
  idempotencyKey?: string;
  verificationToken?: string;
  createdAt: string;
  paidAt?: string;
}

export interface Invoice {
  id: string;
  fromUuid: string;
  fromName: string;
  toUuid: string;
  toName: string;
  amount: Cents;
  description: string;
  status: InvoiceStatus;
  transactionId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface TokenInfo {
  tokenId: string;
  uuid: string;
  value: Cents;
  valid: boolean;
}

export interface SystemStatus {
  minecraftServer: ServerStatus;
  rcon: ServerStatus;
  dataPack: ServerStatus;
  database: ServerStatus;
  playit: ServerStatus;
  minecraftLatencyMs?: number;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  locked: boolean;
  minecraftUuid?: string;
  minecraftUsername?: string;
  minecraftLinkedAt?: string;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100);
}

export function formatCents(cents: Cents): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(centsToEuros(cents));
}

export function isValidCents(value: unknown): value is Cents {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_TRANSACTION_CENTS
  );
}

export function requiresVerification(cents: Cents): boolean {
  return cents > TRANSFER_LIMIT_CENTS;
}

export function generateIdempotencyKey(): string {
  return `idem-${cryptoRandomBytes(16).toString('hex')}`;
}

function cryptoRandomBytes(length: number): Buffer {
  // Uses global crypto (Node 19+/browser). Web Crypto in Node 20.
  const array = new Uint8Array(length);
  globalThis.crypto.getRandomValues(array);
  return Buffer.from(array);
}

export const DISCLAIMER_TEXT =
  'N26 Minecraft Banking – Fan-/Spielsystem für MinigamesV2. Dies ist keine echte Bank, ' +
  'kein echtes Finanzprodukt und steht in keiner Verbindung zu einer realen Bank oder einem ' +
  'Zahlungsdienstleister. Alle angezeigten Beträge sind ausschließlich virtuelle Werte ' +
  'innerhalb des Minecraft-Servers.';

// ------------------------------------------------------------------
// UNKNOWN WORLD – Puzzle Game
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

/**
 * Puzzle content that may be shown to the client. NEVER includes the answer.
 * Asset URLs are relative and served from the web app's public folder
 * (e.g. "/assets/levels/3/scene.svg").
 */
export interface LevelBody {
  /** Instruction / narrative text (terminal style). */
  text?: string;
  /** Source code or HTML snippet that contains a clue. */
  code?: string;
  /** Image asset URL (relative). */
  image?: string | null;
  /** Audio asset URL (relative). */
  audio?: string | null;
  /** Downloadable file URL (relative). */
  file?: string | null;
  /** Optional additional structured payload (grids, coordinates, ...). */
  extra?: Record<string, string> | null;
}

export interface LevelHint {
  key: number;
  text: string;
}

export interface LevelMeta {
  id: number;
  slug: string;
  title: string;
  difficulty: LevelDifficulty;
  puzzleType: PuzzleType;
  orderIndex: number;
  storyKey: StoryKey | null;
  active: boolean;
  solved: boolean;
  unlocked: boolean;
  hintsUsed: number;
  totalHints: number;
  attempts: number;
  nextLevelId: number | null;
}

export interface LevelContent extends LevelMeta {
  description: string;
  body: LevelBody;
  /** Hints the player has unlocked so far only. */
  hints: LevelHint[];
}

export interface LevelSubmitResult {
  solved: boolean;
  alreadySolved: boolean;
  levelId: number;
  nextLevelId: number | null;
  storyReveal: string | null;
}

export interface GameProgress {
  solvedCount: number;
  unlockedCount: number;
  totalActive: number;
  currentLevelId: number | null;
  storyKey: StoryKey | null;
}

/**
 * Full level definition as used by the admin editor. Contains the answers –
 * this type is only used on the server side / admin API (never exposed to
 * normal players).
 */
export interface LevelFull {
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
  hints: LevelHint[];
  createdAt: string;
  updatedAt: string;
}

/** Difficulty in filled block marks, e.g. "■■■□□". */
export function difficultyBlocks(level: LevelDifficulty): string {
  const full = '■'.repeat(level);
  const empty = '□'.repeat(5 - level);
  return `${full}${empty}`;
}