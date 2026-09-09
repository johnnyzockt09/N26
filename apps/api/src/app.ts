import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config/index.js';
import { Database } from './db/database.js';
import { initDatabase } from './db/index.js';
import { AuthService } from './services/auth.js';
import { LinkingService } from './services/linking.js';
import { TransactionService } from './services/transaction.js';
import { StatusService } from './services/status.js';
import { RconService } from './services/rcon.js';
import { LevelService } from './services/levels.js';

import { registerAuthRoutes } from './routes/auth.js';
import { registerLinkRoutes } from './routes/link.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerTransactionRoutes } from './routes/transaction.js';
import { registerInvoiceRoutes } from './routes/invoice.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerGameRoutes } from './routes/levels.js';
import { authenticateAndCsrf } from './middleware/auth.js';

export interface AppContext {
  db: Database;
  authService: AuthService;
  linkingService: LinkingService;
  transactionService: TransactionService;
  statusService: StatusService;
  rcon: RconService;
  levelService: LevelService;
}

export async function buildApp(opts: { databaseUrl?: string } = {}): Promise<{ app: FastifyInstance; ctx: AppContext; close: () => Promise<void> }> {
  const databaseUrl = opts.databaseUrl ?? config.databaseUrl;
  const database = initDatabase(databaseUrl);
  const db = database.db;

  const levelService = new LevelService(db);
  try {
    await levelService.seedIfEmpty();
  } catch (err) {
    console.error('Level-Seeding fehlgeschlagen:', err);
  }

  const app = Fastify({
    logger: config.nodeEnv === 'production' ? false : { transport: undefined, level: 'info' },
    bodyLimit: 100_000,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // CORS: only allow the configured frontend origin(s). Reflection of any
  // origin via "*" is explicitly forbidden in production so the API is only
  // reachable from the operator's own frontend (e.g. the Netlify domain).
  const allowedOrigins = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    if (config.nodeEnv === 'production') {
      throw new Error('CORS darf in Produktion nicht "*" sein – setze WEB_ORIGIN auf die Netlify-/Frontend-Domain.');
    }
    allowedOrigins.push('http://localhost:5173');
  }

  await app.register(cors, {
    // Array form enforces membership: only requests whose Origin header is
    // in the configured list receive CORS headers. A plain string would be
    // sent unconditionally, effectively allowing any origin to claim it.
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token', 'Authorization'],
  });

  await app.register(cookie, { secret: config.sessionSecret });

  await app.register(rateLimit, {
    max: config.rateLimit.maxApi,
    timeWindow: config.rateLimit.windowMs,
    global: true,
  });

  const rcon = new RconService(config.rcon);
  const authService = new AuthService(db);
  const linkingService = new LinkingService(db, rcon);
  const transactionService = new TransactionService(db, rcon);
  const statusService = new StatusService(db, rcon);

  const ctx: AppContext = { db, authService, linkingService, transactionService, statusService, rcon, levelService };
  app.decorate('db', db);
  app.decorate('authService', authService);

  // Global authentication + CSRF protection for all state-changing requests
  app.addHook('preHandler', authenticateAndCsrf(authService));

  // API routes
  registerAuthRoutes(app, authService);
  registerLinkRoutes(app, linkingService, db);
  registerAccountRoutes(app, db, rcon);
  registerTransactionRoutes(app, db, transactionService);
  registerInvoiceRoutes(app, db, transactionService);
  registerStatusRoutes(app, statusService);
  registerAdminRoutes(app, db, rcon, statusService, levelService);
  registerGameRoutes(app, levelService);

  app.get('/api', async () => ({ name: 'N26 Minecraft Banking API', version: '1.0.0' }));

  // Serve the built frontend (apps/web/dist) directly from the backend.
  // This enables a single-origin deployment ("Variante C"): one process, one
  // URL – no Netlify, no CORS, no external database (SQLite). When the dist
  // folder is absent (e.g. API-only deployments), API requests still get
  // proper JSON 404s.
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  const hasWeb = existsSync(webDist) ? webDist : null;
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  };

  app.setNotFoundHandler(async (req, reply) => {
    if (!hasWeb || req.method !== 'GET' && req.method !== 'HEAD') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Nicht gefunden' } });
    }
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Nicht gefunden' } });
    }

    let pathName = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathName === '/') pathName = '/index.html';
    const filePath = resolve(hasWeb, `.${pathName}`);
    const indexHtml = resolve(hasWeb, 'index.html');

    if (!filePath.startsWith(hasWeb)) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Verboten' } });
    }

    try {
      const target = existsSync(filePath) ? filePath : indexHtml;
      const body = await readFile(target);
      const type = MIME[extname(target)] ?? 'application/octet-stream';
      return reply.type(type).header('cache-control', type.includes('text/html') ? 'no-cache' : 'public, max-age=31536000, immutable').send(body);
    } catch {
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
    }
    if (err && (err as { code?: string }).code === 'FST_ERR_BODY_TOO_LARGE') {
      return reply.status(413).send({ success: false, error: { code: 'BODY_TOO_LARGE', message: 'Anfrage zu groß' } });
    }
    return reply.status(status).send({ success: false, error: { code: 'INTERNAL', message: 'Interner Fehler' } });
  });

  const close = async () => {
    await rcon.disconnect();
    await database.close();
  };

  return { app, ctx, close };
}

export async function startServer(): Promise<void> {
  const { app, close } = await buildApp();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`N26 API läuft auf http://0.0.0.0:${config.port}`);

  const shutdown = async () => {
    console.log('Server wird heruntergefahren...');
    await close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}