// Netlify Functions entry – the whole API runs as one serverless function.
// The Fastify app (all routes + security middleware) lives in @n26/api and
// is invoked through the adapters in apps/api/src/netlify.ts.
import { handler } from '@n26/api/netlify';

export { handler };

export default handler;