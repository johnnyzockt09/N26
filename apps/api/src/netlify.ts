import { buildApp } from './app.js';
import type { InjectOptions } from 'light-my-request';

/**
 * Netlify Functions adapter for the existing Fastify API.
 *
 * The whole application (routing, auth/session, CSRF, rate limit, CORS,
 * helmet, level seeding) runs unchanged inside a Netlify serverless
 * function. Incoming Lambda events are translated to `fastify.inject()`
 * requests, so no route/middleware logic is duplicated or weakened.
 */

export interface NetlifyEvent {
  httpMethod?: string;
  path?: string;
  rawUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
}

export async function makeHandler(databaseUrl?: string) {
  const { app } = await buildApp({ databaseUrl });
  await app.ready();

  return async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
    const method = (event.httpMethod ?? 'GET').toUpperCase() as InjectOptions['method'];

    let target: URL;
    if (event.rawUrl) {
      target = new URL(event.rawUrl);
    } else {
      target = new URL('http://localhost' + (event.path ?? '/'));
    }
    const url = `${target.pathname}${target.search}`;

    let payload: string | undefined;
    if (event.body) {
      payload = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value == null) continue;
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }

    const options = {
      method,
      url,
      headers,
      payload,
    } as unknown as InjectOptions;
    const injected = await app.inject(options);

    const responseHeaders: Record<string, string> = {};
    const multiValueHeaders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(injected.headers)) {
      const k = key.toLowerCase();
      if (k === 'set-cookie' || Array.isArray(value)) {
        const items = (Array.isArray(value) ? value : [value]).filter(
          (v): v is string => typeof v === 'string',
        );
        multiValueHeaders[k] = [...(multiValueHeaders[k] ?? []), ...items];
      } else if (typeof value === 'string') {
        responseHeaders[k] = value;
      }
    }

    return {
      statusCode: injected.statusCode,
      headers: responseHeaders,
      multiValueHeaders,
      body: typeof injected.body === 'string' ? injected.body : JSON.stringify(injected.body ?? ''),
    };
  };
}

let cachedHandler: ((event: NetlifyEvent) => Promise<NetlifyResponse>) | null = null;

/**
 * Netlify entry point. The app instance is created once per warm container
 * and reused across invocations (DB pool + Fastify stay warm).
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (!cachedHandler) {
    cachedHandler = await makeHandler();
  }
  return cachedHandler(event);
}