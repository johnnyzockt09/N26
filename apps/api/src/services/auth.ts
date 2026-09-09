import { config } from '../config/index.js';
import { Database, UserRecord } from '../db/database.js';
import {
  generateSessionToken,
  generateVerificationToken,
  hashPassword,
  hashToken,
  issueCsrfToken,
  verifyPassword,
} from '../lib/security.js';

export interface SessionEnvelope {
  sessionToken: string;
  csrfToken: string;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  locked: boolean;
}

const SESSION_TTL = config.session.ttlSeconds * 1000;

export class AuthService {
  constructor(private readonly db: Database) {}

  async register(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<{ user: UserRecord } | { error: string }> {
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return { error: 'INVALID_USERNAME' };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { error: 'INVALID_EMAIL' };
    }
    if (input.password.length < 10) {
      return { error: 'WEAK_PASSWORD' };
    }
    if (!/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/\d/.test(input.password)) {
      return { error: 'WEAK_PASSWORD' };
    }

    const existingUser = await this.db.users.findByUsername(username);
    if (existingUser) return { error: 'USERNAME_TAKEN' };
    const existingEmail = await this.db.users.findByEmail(email);
    if (existingEmail) return { error: 'EMAIL_TAKEN' };

    const passwordHash = await hashPassword(input.password);
    const role: UserRecord['role'] = 'user';
    const user = await this.db.users.create({ username, email, passwordHash, role });
    await this.db.auditLogs.create({ event: 'REGISTER', actorUserId: user.id, details: { username } });
    return { user };
  }

  async login(input: { identifier: string; password: string; ip?: string; userAgent?: string }): Promise<SessionEnvelope | { error: string }> {
    const identifier = input.identifier.trim();
    const user =
      (await this.db.users.findByUsername(identifier)) ??
      (await this.db.users.findByEmail(identifier.toLowerCase()));

    if (!user) {
      await this.db.auditLogs.create({ event: 'LOGIN_FAILED', details: { identifier }, ipAddress: input.ip });
      return { error: 'INVALID_CREDENTIALS' };
    }

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      await this.db.auditLogs.create({ event: 'LOGIN_FAILED', actorUserId: user.id, ipAddress: input.ip });
      return { error: 'INVALID_CREDENTIALS' };
    }

    if (user.locked) {
      await this.db.auditLogs.create({ event: 'LOGIN_FAILED', actorUserId: user.id, details: { reason: 'account_locked' }, ipAddress: input.ip });
      return { error: 'ACCOUNT_LOCKED' };
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const session = await this.db.sessions.create({
      userId: user.id,
      tokenHash,
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL),
    });

    await this.db.auditLogs.create({ event: 'LOGIN', actorUserId: user.id, ipAddress: input.ip });

    return {
      sessionToken,
      csrfToken: issueCsrfToken(session.id),
      user: this.toPublic(user),
    };
  }

  async logout(sessionToken: string | null): Promise<void> {
    if (!sessionToken) return;
    const session = await this.db.sessions.findValidByTokenHash(hashToken(sessionToken));
    if (!session) return;
    await this.db.sessions.revoke(session.id);
    await this.db.auditLogs.create({ event: 'LOGOUT', actorUserId: session.userId });
  }

  async authenticate(sessionToken: string | null): Promise<{ user: UserRecord; sessionId: string } | null> {
    if (!sessionToken) return null;
    const session = await this.db.sessions.findValidByTokenHash(hashToken(sessionToken));
    if (!session) return null;
    const user = await this.db.users.findById(session.userId);
    if (!user || user.locked) return null;
    return { user, sessionId: session.id };
  }

  async rotateSession(sessionId: string): Promise<{ sessionToken: string; csrfToken: string }> {
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    await this.db.sessions.updateTokenHash(sessionId, tokenHash, new Date(Date.now() + SESSION_TTL));
    return { sessionToken, csrfToken: issueCsrfToken(sessionId) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ error?: string }> {
    const user = await this.db.users.findById(userId);
    if (!user) return { error: 'NOT_FOUND' };
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) return { error: 'WRONG_PASSWORD' };
    if (newPassword.length < 10) return { error: 'WEAK_PASSWORD' };
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return { error: 'WEAK_PASSWORD' };
    }
    const passwordHash = await hashPassword(newPassword);
    await this.db.users.updatePassword(userId, passwordHash);
    // Invalidate all other sessions on password change
    await this.db.sessions.revokeAllForUser(userId);
    await this.db.auditLogs.create({ event: 'PASSWORD_CHANGE', actorUserId: userId });
    return {};
  }

  async verifyEmailToken(userId: string): Promise<string> {
    // Placeholder for future email verification; returns a short-lived code.
    return generateVerificationToken();
  }

  toPublic(user: UserRecord): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      locked: user.locked,
    };
  }
}