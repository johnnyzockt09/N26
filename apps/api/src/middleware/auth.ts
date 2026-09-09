import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth.js';
import { isValidCsrfToken } from '../lib/security.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      username: string;
      email: string;
      role: 'user' | 'admin';
      sessionId: string;
    };
  }
}

export const SESSION_COOKIE = 'n26_session';
export const CSRF_HEADER = 'x-csrf-token';

export function sessionCookieValue(token: string): string {
  return token;
}

/**
 * Resolve the session cookie into req.auth (if valid). Does not write the
 * reply – a failed resolution simply leaves req.auth undefined.
 */
export async function resolveAuth(req: FastifyRequest, authService: AuthService): Promise<void> {
  const sessionToken = req.cookies?.[SESSION_COOKIE] ?? null;
  if (!sessionToken) {
    req.auth = undefined;
    return;
  }
  const session = await authService.authenticate(sessionToken);
  if (!session) {
    req.auth = undefined;
    return;
  }
  req.auth = {
    userId: session.user.id,
    username: session.user.username,
    email: session.user.email,
    role: session.user.role,
    sessionId: session.sessionId,
  };
}

/**
 * Global preHandler:
 * 1. Resolve authentication from the session cookie.
 * 2. Enforce CSRF on state-changing requests when a session is present.
 *    Public endpoints (login/register) carry no cookie, so they are exempt
 *    and CSRF is not meaningful for them.
 */
export function authenticateAndCsrf(authService: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    await resolveAuth(req, authService);

    const method = req.method.toUpperCase();
    const isSafe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

    if (isSafe || !req.auth) {
      return undefined;
    }

    const provided = req.headers[CSRF_HEADER] as string | undefined;
    if (!provided || !isValidCsrfToken(provided, req.auth.sessionId)) {
      return reply.status(403).send({ success: false, error: { code: 'CSRF_INVALID', message: 'CSRF-Token ungültig' } });
    }
    return undefined;
  };
}

/**
 * Requires an authenticated user. Writes a 401 reply and returns false when
 * the request is unauthenticated.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!req.auth) {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Nicht angemeldet' } });
    return false;
  }
  return true;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!req.auth) {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Nicht angemeldet' } });
    return false;
  }
  if (req.auth.role !== 'admin') {
    reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Keine Berechtigung' } });
    return false;
  }
  return true;
}