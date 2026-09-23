import express from 'express';
import rateLimit from 'express-rate-limit';
import { captureError } from '../lib/observability.js';

// Crash reports from the web app (React ErrorBoundary + window error handlers),
// forwarded to the server's Sentry project so client crashes show up next to
// server errors without a second Sentry setup. Signed-in users only; fields
// are clipped and the rate is capped, since the body is user-controlled.
const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user.id}`,
  handler: (_req, res) => res.status(204).end(),
});

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

router.post('/', limiter, (req, res) => {
  const body = req.body || {};
  const message = clip(body.message, 500) || 'Unknown client error';
  const err = new Error(`[client] ${message}`);
  const stack = clip(body.stack, 4000);
  if (stack) err.stack = `Error: [client] ${message}\n${stack}`;
  captureError(err, {
    userId: req.user.id,
    route: `client ${clip(body.path, 200) || ''}`.trim(),
    extra: {
      kind: clip(body.kind, 40),
      componentStack: clip(body.componentStack, 2000),
      build: clip(body.build, 80),
      userAgent: clip(req.get('user-agent'), 300),
    },
  });
  console.warn(`[client-error] user ${req.user.id} ${clip(body.path, 200) || ''}: ${message}`);
  res.status(204).end();
});

export default router;
