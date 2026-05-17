import './env.js';
import express from 'express';
import cors from 'cors';
import { createReadStream, existsSync, statSync } from 'fs';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  const tz = req.get('X-Client-Timezone');
  if (tz && typeof tz === 'string' && tz.length <= 64) {
    req.clientTimezone = tz;
  }
  next();
});

// Auth routes (unprotected)
app.use('/api/auth', authRouter);

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

// TEMPORARY: one-time data recovery endpoint. REMOVE after use.
app.get('/__recovery/gtd-db', (req, res) => {
  const token = req.query.token;
  const expected = process.env.RECOVERY_TOKEN;
  if (!expected || token !== expected) return res.status(404).send('Not found');
  const path = process.env.DATABASE_PATH || '/data/gtd.db';
  if (!existsSync(path)) return res.status(404).send('Legacy gtd.db not present');
  const size = statSync(path).size;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="gtd.db"');
  res.setHeader('Content-Length', String(size));
  createReadStream(path).pipe(res);
});

// Expose Google Client ID to frontend (safe — this is a public value)
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID });
});

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
}

async function start() {
  await pingDb();
  app.listen(PORT, () => {
    console.log(`Cleartable server running on http://localhost:${PORT}`);
  });
}

start();
