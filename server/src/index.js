import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pingDb, pool } from './db/pool.js';
import { captureError, flushErrors } from './lib/observability.js';
import { requireAuth } from './middleware/auth.js';
import { aiRateLimiter } from './middleware/rateLimit.js';
import { todayInTz, isValidTimezone } from './lib/dateTime.js';
import authRouter from './routes/auth.js';
import tasksRouter from './routes/tasks.js';
import projectsRouter from './routes/projects.js';
import aiRouter from './routes/ai.js';
import insightsRouter from './routes/insights.js';
import contextsRouter from './routes/contexts.js';
import habitsRouter from './routes/habits.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';
import customListsRouter from './routes/customLists.js';
import billingRouter, { paddleWebhookHandler } from './routes/billing.js';
import { isCheckoutEnabled, founderSpotsLeft, FOUNDER_CAP } from './services/paddle.js';
import preferencesRouter from './routes/preferences.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Railway terminates TLS at a single proxy layer; needed so req.ip (rate
// limiting) reflects the client, not the proxy.
app.set('trust proxy', 1);

// CSP is off until we can craft a policy that doesn't break Google Identity
// Services + the landing page's inline scripts; COOP must allow popups or the
// Google sign-in popup can't talk back to the opener.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Prod is same-origin (Express serves the client), so CORS only needs to admit
// local Vite dev servers. Override with CORS_ORIGINS (comma-separated) if needed.
const corsOrigins = (process.env.CORS_ORIGINS ||
  'https://cleartable.app,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176'
).split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins }));

// The Paddle webhook must see the exact raw bytes to verify its signature, so
// it's registered with express.raw BEFORE the global JSON parser. Public route
// (Paddle calls it); the signature is the auth.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), paddleWebhookHandler);

app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  // Only a valid IANA zone is trusted; anything else falls back to UTC instead
  // of throwing inside toLocaleDateString later (a garbage header 500'd AI routes).
  const tz = req.get('X-Client-Timezone');
  if (isValidTimezone(tz)) {
    req.clientTimezone = tz;
  }
  // "Today" in the user's local timezone (falls back to UTC). Used by any route
  // whose result depends on the current calendar day.
  req.today = todayInTz(req.clientTimezone);
  next();
});

// Public routes (no auth)
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/ai', requireAuth, aiRateLimiter, aiRouter);
app.use('/api/insights', requireAuth, insightsRouter);
app.use('/api/contexts', requireAuth, contextsRouter);
app.use('/api/habits', requireAuth, habitsRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/import', requireAuth, importRouter);
app.use('/api/custom-lists', requireAuth, customListsRouter);
app.use('/api/billing', requireAuth, billingRouter);
app.use('/api/preferences', requireAuth, preferencesRouter);

// Health touches the database so a wedged pool or a dead Postgres shows up
// here (Railway restarts on non-2xx), not only in user-facing 500s.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[health] db check failed:', err.message);
    res.status(503).json({ status: 'degraded', error: 'database_unreachable' });
  }
});

// Expose public client config to the frontend (all safe-to-publish values):
// Google client id, plus the Paddle client-side token, environment, the price
// ids the upgrade UI offers, whether checkout is open, and founder seats left.
app.get('/api/config', async (req, res) => {
  let founderLeft = null;
  try {
    founderLeft = await founderSpotsLeft();
  } catch (error) {
    console.error('[config] founderSpotsLeft failed:', error.message);
  }
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    paddle: {
      clientToken: process.env.PADDLE_CLIENT_TOKEN || null,
      environment: process.env.PADDLE_ENV || 'sandbox',
      checkoutEnabled: isCheckoutEnabled(),
      founderCap: FOUNDER_CAP,
      founderSpotsLeft: founderLeft,
      prices: {
        monthly: process.env.PADDLE_PRICE_PRO_MONTHLY || null,
        yearly: process.env.PADDLE_PRICE_PRO_YEARLY || null,
        founder: process.env.PADDLE_PRICE_FOUNDER || null,
      },
    },
  });
});

// Unknown API routes answer JSON, not the SPA/landing HTML fallback below.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` });
});

// Static + SPA routing in production:
//   /                  → landing page (marketing site, static HTML)
//   /app, /app/*       → React app (SPA with client-side routing)
//   /api/*             → already registered above (auth, tasks, etc.)
//
// Built React assets reference paths like /app/assets/index-XXXX.js (Vite's
// `base` config), and Express serves dist/ under /app, so the URLs match.
// SPA fallback returns /app's index.html for any /app/* path that isn't a
// real file, so deep links like /app/inbox work after refresh.
if (process.env.NODE_ENV === 'production') {
  const landingPath = join(__dirname, '../../landing-page');
  const clientDistPath = join(__dirname, '../../client/dist');

  // App lives at /app/*. The service worker, the SPA entry HTML, and the web
  // manifest must NEVER be held in a stale cache — they're how the PWA discovers
  // a new build (index.html points at the content-hashed bundle; sw.js drives the
  // update). Force revalidation on those; the hashed assets keep default
  // (effectively immutable) caching.
  const noCacheFiles = /(?:sw\.js|workbox-[^/]+\.js|index\.html|manifest\.webmanifest|registerSW\.js)$/;
  app.use('/app', express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (noCacheFiles.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('/app/*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(clientDistPath, 'index.html'));
  });

  // Landing page at root. The static middleware serves /style.css, /icons/*,
  // etc. directly; the catch-all falls back to landing-page/index.html for
  // anything not matched above (including bare `/`).
  app.use(express.static(landingPath));

  // /pricing.html never existed as a file; external listings (Paddle) point at
  // it, so send them to the pricing section of the homepage.
  app.get('/pricing.html', (req, res) => res.redirect(301, '/#pricing'));

  // Everything else is a real 404. Serving index.html with a 200 for unknown
  // paths made every vulnerability probe (/.env, /wp-admin/...) look like a
  // page view and gave search engines thousands of soft-404 duplicates.
  app.use((req, res) => {
    res.status(404);
    if (req.accepts('html')) return res.sendFile(join(landingPath, '404.html'));
    res.type('txt').send('Not found');
  });
}

// Final error handler: every thrown/next(err) error becomes JSON with a stable
// shape and never leaks a stack. Body-parser errors get their proper 4xx.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large' });
  }
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    captureError(err, { userId: req.user?.id, route: `${req.method} ${req.route?.path || req.path}` });
  }
  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 ? 'internal_error' : (err.code || 'request_failed'),
    message: status >= 500 ? 'Something went wrong on our side' : err.message,
  });
});

let server;

async function shutdown(signal) {
  console.log(`[shutdown] ${signal} received — closing`);
  // Railway sends SIGTERM on redeploy. Stop accepting, let in-flight requests
  // finish, return pooled connections, then exit. Hard-exit after 10s so a
  // stuck connection can't keep the old instance alive.
  const force = setTimeout(() => { console.error('[shutdown] forced exit'); process.exit(1); }, 10_000);
  force.unref();
  try {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await pool.end();
    await flushErrors();
  } catch (err) {
    console.error('[shutdown] error while closing:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  captureError(reason instanceof Error ? reason : new Error(String(reason)), { route: 'unhandledRejection' });
});
process.on('uncaughtException', async (err) => {
  console.error('[uncaughtException]', err);
  captureError(err, { route: 'uncaughtException' });
  await flushErrors();
  process.exit(1);
});

async function start() {
  await pingDb();
  server = app.listen(PORT, () => {
    console.log(`Cleartable server running on http://localhost:${PORT}`);
  });
}

start().catch(async (err) => {
  console.error('Failed to start:', err);
  captureError(err, { route: 'start' });
  await flushErrors();
  process.exit(1);
});
