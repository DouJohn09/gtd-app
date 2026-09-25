import express from 'express';
import crypto from 'node:crypto';
import { buildPulse } from '../services/pulse.js';
import { recordOpsEvent } from '../lib/opsEvents.js';
import { serverError } from '../lib/httpErrors.js';

// Machine-to-machine endpoints for the founder's monitoring, behind one shared
// secret (PULSE_TOKEN, Authorization: Bearer …). Unset token → the routes
// don't exist (404), so a fresh environment exposes nothing.
const router = express.Router();

function tokenOk(req) {
  const expected = process.env.PULSE_TOKEN;
  if (!expected || expected.length < 24) return null;
  const got = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  const ok = tokenOk(req);
  if (ok === null) return res.status(404).json({ error: 'Not found' });
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /api/internal/pulse — aggregate health/traffic/funnel numbers.
router.get('/pulse', async (req, res) => {
  try {
    res.json(await buildPulse());
  } catch (error) {
    serverError(req, res, error);
  }
});

// POST /api/internal/inquiry { from, subject } — called by the Cloudflare
// Email Worker for each mail to support@/hello@. Stores a masked sender and a
// clipped subject only; the mail itself still goes to the founder's inbox.
router.post('/inquiry', (req, res) => {
  const from = String(req.body?.from || '');
  const [local = '', domain = ''] = from.replace(/.*</, '').replace(/>.*/, '').split('@');
  const subject = String(req.body?.subject || '(no subject)').replace(/\s+/g, ' ').slice(0, 120);
  recordOpsEvent('inquiry', `${local.slice(0, 2)}***@${domain} · ${subject}`);
  res.status(204).end();
});

export default router;
