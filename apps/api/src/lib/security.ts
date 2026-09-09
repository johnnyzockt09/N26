import argon2 from 'argon2';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 2,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  // Sessions are stored hashed; the raw token is only ever in the cookie.
  return createHash('sha256').update(token).digest('hex');
}

export function generateVerificationToken(): string {
  // High-entropy, single-use verification token.
  return `vt_${randomBytes(32).toString('base64url')}`;
}

export function generateChallengeCode(): string {
  // Short-lived, human-transcriptable linking challenge.
  return `${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function generateTransactionNumber(): string {
  return `TX-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export function generateInvoiceNumber(): string {
  return `INV-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function generateRequestId(): string {
  return `req_${randomBytes(8).toString('hex')}`;
}

export function generateIdempotencyKey(): string {
  return `idem-${randomBytes(16).toString('hex')}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidCsrfToken(token: string, sessionId: string): boolean {
  const expected = createHmac('sha256', config.sessionSecret)
    .update(`csrf:${sessionId}`)
    .digest('base64url');
  return safeEqual(token, expected);
}

export function issueCsrfToken(sessionId: string): string {
  return createHmac('sha256', config.sessionSecret)
    .update(`csrf:${sessionId}`)
    .digest('base64url');
}