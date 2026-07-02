import { Router } from 'express';
import { pool } from '../db/pool.js';
import { sendWaitlistWelcome } from '../services/email.js';

const router = Router();

// Conservative server-side email check. The browser already enforces
// <input type="email">; this exists to filter out obvious garbage that
// would bypass the form (curl, bots).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// In-memory rate limit: max RATE_LIMIT_MAX submissions per IP per window.
// Resets when the process restarts — fine for a pre-launch waitlist;
// any persistent bot can already be blocked by the UNIQUE constraint
// on email since they'd need fresh emails to spam.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipBuckets = new Map(); // ip -> { count, windowStart }

function ipKey(req) {
  // Trust Railway's `x-forwarded-for` proxy header; fall back to socket.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const ip = ipKey(req);
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

router.post('/', async (req, res) => {
  // Always return 200 to avoid email-enumeration leaks — the form can't
  // distinguish "you're new" from "you're already subscribed".
  try {
    if (isRateLimited(req)) {
      // Still return 200 with a generic shape — we don't want to give
      // crawlers signal on whether they hit a limit.
      return res.json({ ok: true });
    }

    const { email, source } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.json({ ok: true });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSource = typeof source === 'string' && source.length <= 32
      ? source
      : null;

    const { rows } = await pool.query(
      `INSERT INTO waitlist (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [normalizedEmail, normalizedSource]
    );

    // Only email genuinely new signups (RETURNING is empty on a duplicate).
    // Fire-and-forget: a mail failure must never fail or delay the signup, and
    // we still return the same {ok:true} either way (no enumeration signal).
    if (rows.length > 0) {
      sendWaitlistWelcome(normalizedEmail).catch(err =>
        console.error('Waitlist welcome email failed:', err.message)
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Waitlist signup error:', err);
    // Even on internal errors, return 200 to avoid leaking implementation.
    // Real errors go to logs/Sentry (once we have Sentry).
    return res.json({ ok: true });
  }
});

export default router;
