// ─── Local Node.js Dev Server ───────────────────────────────────────────────
// Used only for Replit development: `node backend/dev-server.js`
// For Cloudflare Workers deployment: `npx wrangler deploy`
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './server.js';

// Serve frontend static files for local dev
app.use('/*', serveStatic({ root: './frontend' }));

const PORT = parseInt(process.env.PORT || '5000', 10);
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log(`🚀 Dev server running on http://0.0.0.0:${PORT}`);
});
