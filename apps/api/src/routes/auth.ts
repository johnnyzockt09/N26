import { FastifyInstance } from 'fastify';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth.js';
import { AuthService } from '../services/auth.js';
import { config } from '../config/index.js';
import { Database } from '../db/database.js';
import { issueCsrfToken } from '../lib/security.js';

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    INVALID_USERNAME: 'Benutzername ungültig (3-32 Zeichen, Buchstaben/Zahlen/Unterstrich)',
    INVALID_EMAIL: 'E-Mail-Adresse ungültig',
    WEAK_PASSWORD: 'Passwort muss mindestens 10 Zeichen mit Groß-, Kleinbuchstaben und Zahl enthalten',
    USERNAME_TAKEN: 'Benutzername bereits vergeben',
    EMAIL_TAKEN: 'E-Mail bereits vergeben',
  };
  return map[code] ?? 'Fehler';
}

function loginError(code: string): string {
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: 'Benutzername oder Passwort falsch',
    ACCOUNT_LOCKED: 'Konto gesperrt',
  };
  return map[code] ?? 'Fehler';
}

function cookieBase(): { httpOnly: boolean; secure: boolean; sameSite: 'lax' | 'strict' | 'none'; path: string; domain?: string } {
  const secure = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: config.cookieSameSite,
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

export function setSessionCookie(reply: { setCookie(name: string, value: string, opts: Record<string, unknown>): void }, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, cookieBase());
}

export function clearSessionCookie(reply: { clearCookie(name: string, opts?: Record<string, unknown>): void }): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  const authLimit = { max: config.rateLimit.maxAuth, timeWindow: config.rateLimit.windowMs };

  app.post('/api/auth/register', { config: { rateLimit: authLimit } }, async (req, reply) => {
    const body = req.body as { username?: string; email?: string; password?: string };
    if (!body || typeof body !== 'object' || !body.username || !body.email || !body.password) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Eingaben' } });
    }
    const result = await authService.register({ username: body.username, email: body.email, password: body.password });
    if ('error' in result) {
      return reply.status(400).send({ success: false, error: { code: result.error, message: errorMessage(result.error) } });
    }
    return reply.status(201).send({ success: true, data: authService.toPublic(result.user) });
  });

  app.post('/api/auth/login', { config: { rateLimit: authLimit } }, async (req, reply) => {
    const body = req.body as { identifier?: string; password?: string };
    if (!body || typeof body !== 'object' || !body.identifier || !body.password) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Eingaben' } });
    }
    const ip = req.ip;
    const ua = req.headers['user-agent']?.slice(0, 300) ?? undefined;
    const result = await authService.login({ identifier: body.identifier, password: body.password, ip, userAgent: ua });
    if ('error' in result) {
      return reply.status(401).send({ success: false, error: { code: result.error, message: loginError(result.error) } });
    }
    const { sessionToken, csrfToken, user } = result;
    setSessionCookie(reply, sessionToken);
    return reply.send({ success: true, data: { user, csrfToken } });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE] ?? null;
    await authService.logout(token);
    clearSessionCookie(reply);
    return reply.send({ success: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const { db } = req.server as unknown as { db: Database };
    const user = await authService.authenticate(req.cookies?.[SESSION_COOKIE] ?? null);
    if (!user) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Nicht angemeldet' } });
    }
    const link = await db.links.findByUserId(user.user.id);
    const freshCsrf = issueCsrfToken(user.sessionId);
    return reply.send({
      success: true,
      data: {
        ...authService.toPublic(user.user),
        csrfToken: freshCsrf,
        minecraft: link
          ? { uuid: link.minecraftUuid, username: link.minecraftUsername, linkedAt: link.linkedAt.toISOString() }
          : null,
      },
    });
  });

  app.post('/api/auth/password/change', async (req, reply) => {
    const ok = await requireAuth(req, reply);
    if (!ok) return reply;
    const body = req.body as { currentPassword?: string; newPassword?: string };
    if (!body || !body.currentPassword || !body.newPassword) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION', message: 'Ungültige Eingaben' } });
    }
    const result = await authService.changePassword(req.auth!.userId, body.currentPassword, body.newPassword);
    if (result.error) {
      return reply.status(400).send({ success: false, error: { code: result.error, message: 'Passwortänderung fehlgeschlagen' } });
    }
    return reply.send({ success: true });
  });
}