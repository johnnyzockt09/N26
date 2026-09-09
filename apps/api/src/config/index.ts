import 'dotenv/config';

export interface Config {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  cookieDomain?: string;
  cookieSameSite: 'lax' | 'strict' | 'none';
  corsOrigin: string;
  publicUrl: string;
  rcon: {
    host: string;
    port: number;
    password: string;
  };
  minecraft: {
    serverAddress: string;
    serverPort: number;
    playitAddress?: string;
  };
  rateLimit: {
    windowMs: number;
    maxAuth: number;
    maxApi: number;
  };
  verification: {
    ttlSeconds: number;
  };
  session: {
    ttlSeconds: number;
  };
  /** Minecraft-Namen, deren verknüpfter Web-Account automatisch Admin wird. */
  adminMcUsernames: string[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNum(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): Config {
  const nodeEnv = optional('NODE_ENV', 'development');
  // CORS: WEB_ORIGIN is the canonical variable (e.g. the Netlify domain).
  // CORS_ORIGIN remains as a fallback for older deployments.
  const corsOrigin = optional('WEB_ORIGIN', optional('CORS_ORIGIN', 'http://localhost:5173'));
  const sameSiteRaw = optional('COOKIE_SAMESITE', 'lax').toLowerCase();
  const cookieSameSite: Config['cookieSameSite'] =
    sameSiteRaw === 'none' ? 'none' : sameSiteRaw === 'strict' ? 'strict' : 'lax';

  return {
    nodeEnv,
    port: optionalNum('PORT', 3001),
    databaseUrl: required('DATABASE_URL'),
    sessionSecret: required('SESSION_SECRET'),
    cookieDomain: optional('COOKIE_DOMAIN', ''),
    cookieSameSite,
    corsOrigin,
    publicUrl: optional('PUBLIC_URL', 'http://localhost:5173'),
    rcon: {
      host: optional('RCON_HOST', '127.0.0.1'),
      port: optionalNum('RCON_PORT', 25575),
      password: optional('RCON_PASSWORD', ''),
    },
    minecraft: {
      serverAddress: optional('MINECRAFT_SERVER_ADDRESS', ''),
      serverPort: optionalNum('MINECRAFT_SERVER_PORT', 25565),
      playitAddress: optional('PLAYIT_PUBLIC_ADDRESS', ''),
    },
    rateLimit: {
      windowMs: optionalNum('RATE_LIMIT_WINDOW_MS', 60_000),
      maxAuth: optionalNum('RATE_LIMIT_MAX_AUTH', 10),
      maxApi: optionalNum('RATE_LIMIT_MAX_API', 60),
    },
    verification: {
      ttlSeconds: optionalNum('VERIFICATION_TTL_SECONDS', 900),
    },
    session: {
      ttlSeconds: optionalNum('SESSION_TTL_SECONDS', 604_800),
    },
    adminMcUsernames: (optional('ADMIN_MC_USERNAMES', 'Johnnyzockt09')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)),
  };
}

export const config = loadConfig();