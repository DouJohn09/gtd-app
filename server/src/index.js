import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pingDb } from './db/pool.js';
import { requireAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import tasksRouter from './routes/tasks.js';
import projectsRouter from './routes/projects.js';
import aiRouter from './routes/ai.js';
import contextsRouter from './routes/contexts.js';
import habitsRouter from './routes/habits.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';
import customListsRouter from './routes/customLists.js';
import waitlistRouter from './routes/waitlist.js';

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

app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  const tz = req.get('X-Client-Timezone');
  if (tz && typeof tz === 'string' && tz.length <= 64) {
    req.clientTimezone = tz;
  }
  next();
});

// Public routes (no auth)
app.use('/api/auth', authRouter);
app.use('/api/waitlist', waitlistRouter);

// Protected routes
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/contexts', requireAuth, contextsRouter);
app.use('/api/habits', requireAuth, habitsRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/import', requireAuth, importRouter);
app.use('/api/custom-lists', requireAuth, customListsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Expose Google Client ID to frontend (safe — this is a public value)
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID });
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
  app.get('*', (req, res) => {
    res.sendFile(join(landingPath, 'index.html'));
  });
}

async function start() {
  await pingDb();
  app.listen(PORT, () => {
    console.log(`Cleartable server running on http://localhost:${PORT}`);
  });
}

start();
