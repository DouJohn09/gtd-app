import { Router } from 'express';
import { sendWelcome, notifyFounderSignup, sendLoginCode } from '../services/email.js';
import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import net from 'node:net';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { isAdminEmail, isInternalEmail } from '../lib/admin.js';
import { exchangeCodeForTokens, revokeCalendarAccess, isCalendarConnected, calendarScopeFlags, syncUpcomingTasks } from '../services/googleCalendar.js';
import { isProActive } from '../services/billing.js';
import { cancelSubscription } from '../services/paddle.js';
import { isValidTimezone } from '../lib/dateTime.js';
import { serverError } from '../lib/httpErrors.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Login attempts only — /me is hit on every app load and must stay unthrottled
// (shared NAT / office IPs would lock legit users out). 20 per 15min per IP is
// far above any honest login pattern.
//
// Keyed on CF-Connecting-IP when present: traffic arrives Cloudflare → Railway,
// and with `trust proxy 1` req.ip is the Cloudflare edge address, shared by
// many visitors — 20 failed logins from anyone behind the same edge would have
// locked all of them out (M4). The header is only as trustworthy as the path
// (a direct hit on the *.up.railway.app host can set it), which at worst lets
// someone dodge this limiter; sign-in itself is a Google-verified ID token or
// an emailed code that dies after 5 wrong tries, so there is little to
// brute-force.
const clientIpKey = (req) => {
  const cf = req.get('CF-Connecting-IP');
  return ipKeyGenerator(cf && net.isIP(cf) ? cf : req.ip);
};
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
});

const DEFAULT_CONTEXTS = ['@home', '@work', '@errands', '@computer', '@phone', '@anywhere'];

async function seedContextsIfNone(userId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM contexts WHERE user_id = $1', [userId]);
  if ((rows[0]?.cnt ?? 0) > 0) return;
  await Promise.all(DEFAULT_CONTEXTS.map(ctx =>
    pool.query('INSERT INTO contexts (name, user_id) VALUES ($1, $2)', [ctx, userId])
  ));
}

// A brand-new account, from either sign-in method: default contexts, the
// welcome mail and the founder's heads-up.
async function createUser({ googleId = null, email, name = null, picture = null, tz, referrer, utm }) {
  const safeReferrer = typeof referrer === 'string' ? referrer.slice(0, 2048) : null;
  const safeUtm = utm && typeof utm === 'object' && Object.keys(utm).length ? JSON.stringify(utm) : null;
  const { rows } = await pool.query(
    'INSERT INTO users (google_id, email, name, picture, timezone, signup_referrer, signup_utm) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [googleId, email, name, picture, tz, safeReferrer, safeUtm]
  );
  const user = rows[0];
  await seedContextsIfNone(user.id);
  // Fire-and-forget: mail must never delay or fail a sign-in.
  sendWelcome(email, name).catch(err => console.error('[email] welcome failed:', err.message));
  notifyFounderSignup({ email, name, id: user.id, source: safeReferrer || (utm?.utm_source) || null }).catch(err => console.error('[email] founder notice failed:', err.message));
  return user;
}

function signedIn(res, user) {
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: {
      id: user.id, email: user.email, name: user.name, picture: user.picture,
      ai_mode: user.ai_mode || 'assisted',
      ai_accept_streak: user.ai_accept_streak || 0,
      created_at: user.created_at || null,
      onboarded_at: user.onboarded_at || null,
      is_admin: isAdminEmail(user.email),
      is_internal: isInternalEmail(user.email),
    }
  });
}

router.post('/google', loginLimiter, async (req, res) => {
  try {
    const { credential, referrer, utm } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    // Google sets email_verified=false for accounts whose address it hasn't
    // confirmed. The email is our account identity and where we'd send
    // account mail, so an unverified one isn't good enough to sign in with.
    if (payload.email_verified === false) {
      return res.status(401).json({ error: 'Google account email is not verified' });
    }
    // Capture the browser timezone (forwarded via X-Client-Timezone) so
    // server-side "today" is the user's local day. null = leave as-is.
    const tz = isValidTimezone(req.clientTimezone) ? req.clientTimezone : null;

    let { rows: [user] } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    // An account made by email sign-in with this (Google-verified) address:
    // attach Google to it rather than starting a second account.
    if (!user && email) {
      ({ rows: [user] } = await pool.query(
        `UPDATE users SET google_id = $1
          WHERE id = (SELECT id FROM users WHERE lower(email) = lower($2) AND google_id IS NULL ORDER BY id LIMIT 1)
          RETURNING *`,
        [googleId, email]
      ));
    }

    if (user) {
      await pool.query(
        'UPDATE users SET last_login = NOW(), name = $1, picture = $2, timezone = COALESCE($3, timezone) WHERE id = $4',
        [name, picture, tz, user.id]
      );
      user.name = name;
      user.picture = picture;
      // Identity is google_id; the email column follows Google's current
      // address so account mail reaches the user. Guarded against the (rare)
      // case where another account already holds that address.
      if (email && email !== user.email) {
        const { rowCount } = await pool.query(
          `UPDATE users SET email = $1 WHERE id = $2
             AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2)`,
          [email, user.id]
        );
        if (rowCount === 1) user.email = email;
      }
      await seedContextsIfNone(user.id);
    } else {
      user = await createUser({ googleId, email, name, picture, tz, referrer, utm });
    }

    signedIn(res, user);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// ─── Email sign-in: a 6-digit code (and a link) sent to the address ────────
// Owning the inbox is the proof, so an address that already has an account
// (Google or email) signs into that account. Codes live 15 minutes, take 5
// wrong tries, and are stored as HMACs only.
const CODE_TTL_MIN = 15;
const CODE_MAX_TRIES = 5;
const CODES_PER_EMAIL_HOUR = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashSecret = (s) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(s).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const normalEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

// Sending mail costs money and can be aimed at someone else's inbox, so the
// send route gets a tighter per-IP cap than sign-in itself.
const codeSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
});

// App-directory reviewers (Claude, ChatGPT) need a sign-in that works
// without reading our email. REVIEW_LOGIN="address:123456" makes that one
// address accept a fixed code, and nothing is sent. Use it for a demo
// account only; the usual limits (5 tries per code, codes per hour) apply.
const [REVIEW_EMAIL, REVIEW_CODE] = (process.env.REVIEW_LOGIN || '').split(':');
const reviewCodeFor = (email) =>
  REVIEW_EMAIL && /^\d{6}$/.test(REVIEW_CODE || '') && email === normalEmail(REVIEW_EMAIL) ? REVIEW_CODE : null;

router.post('/email/start', codeSendLimiter, async (req, res) => {
  const email = normalEmail(req.body?.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  try {
    await pool.query(`DELETE FROM login_codes WHERE expires_at < NOW() - INTERVAL '1 day'`);
    const { rows: [recent] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM login_codes WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [email]
    );
    if (recent.n >= CODES_PER_EMAIL_HOUR) {
      return res.status(429).json({ error: 'Too many codes for this address. Use the last one we sent, or try again in an hour.' });
    }
    const reviewCode = reviewCodeFor(email);
    const code = reviewCode || String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO login_codes (email, code_hash, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
      [email, hashSecret(`${email}:${code}`), hashSecret(token), CODE_TTL_MIN]
    );
    const appUrl = (process.env.APP_URL || 'https://cleartable.app/app').replace(/\/$/, '');
    const sent = reviewCode ? { skipped: true } : await sendLoginCode(email, code, `${appUrl}/login?token=${token}`);
    // Local dev without Resend: no mail goes out, so show the code here.
    if (sent?.skipped && process.env.NODE_ENV !== 'production') {
      console.log(`[email] dev sign-in code for ${email}: ${code}`);
    }
    res.json({ ok: true });
  } catch (error) {
    if (String(error?.message).startsWith('Resend')) {
      console.error('[email] login code failed:', error.message);
      return res.status(502).json({ error: "We couldn't send the email. Please try again in a minute." });
    }
    serverError(req, res, error);
  }
});

router.post('/email/verify', loginLimiter, async (req, res) => {
  const { code, token, referrer, utm } = req.body || {};
  try {
    let row;
    if (typeof token === 'string' && token) {
      ({ rows: [row] } = await pool.query(
        `UPDATE login_codes SET used_at = NOW()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
          RETURNING email`,
        [hashSecret(token)]
      ));
      if (!row) return res.status(400).json({ error: 'This sign-in link has expired or was already used. Request a new code.' });
    } else {
      const email = normalEmail(req.body?.email);
      const digits = typeof code === 'string' ? code.replace(/\D/g, '') : '';
      if (!email || digits.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit code from the email' });
      const { rows: [latest] } = await pool.query(
        `SELECT id, code_hash, attempts FROM login_codes
          WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()
          ORDER BY created_at DESC LIMIT 1`,
        [email]
      );
      if (!latest) return res.status(400).json({ error: 'This code has expired. Request a new one.' });
      if (latest.attempts >= CODE_MAX_TRIES) return res.status(400).json({ error: 'Too many wrong tries. Request a new code.' });
      if (!sameHash(hashSecret(`${email}:${digits}`), latest.code_hash)) {
        await pool.query('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1', [latest.id]);
        return res.status(400).json({ error: "That code isn't right. Check the latest email and try again." });
      }
      ({ rows: [row] } = await pool.query(
        'UPDATE login_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING email',
        [latest.id]
      ));
      if (!row) return res.status(400).json({ error: 'This code was already used. Request a new one.' });
    }

    const tz = isValidTimezone(req.clientTimezone) ? req.clientTimezone : null;
    let { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE lower(email) = $1 ORDER BY id LIMIT 1',
      [row.email]
    );
    if (user) {
      await pool.query('UPDATE users SET last_login = NOW(), timezone = COALESCE($1, timezone) WHERE id = $2', [tz, user.id]);
      await seedContextsIfNone(user.id);
    } else {
      user = await createUser({ email: row.email, tz, referrer, utm });
    }
    signedIn(res, user);
  } catch (error) {
    serverError(req, res, error);
  }
});

// Sessions are 7-day JWTs. /me runs on every app load, so it doubles as the
// renewal point: once a token is more than a day old we hand back a fresh one
// and the client swaps it in. Net effect is a sliding session — anyone who opens
// the app at least weekly stays signed in, while an abandoned device still
// expires. (Before this, every user was hard-logged-out weekly, which on an
// installed PWA reads as "the app forgot me".)
const TOKEN_RENEW_AFTER_S = 24 * 60 * 60;

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, email, name, picture, created_at,
              (google_calendar_refresh_token IS NOT NULL OR google_calendar_access_token IS NOT NULL) AS google_calendar_connected,
              google_calendar_scopes,
              plan, subscription_status, current_period_end,
              ai_mode, ai_accept_streak, ai_nudge_autopilot_at, ai_nudge_reminder_at,
              onboarded_at
       FROM users WHERE id = $1`,
      [payload.userId]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    user.google_calendar_connected = !!user.google_calendar_connected;
    const calendarFlags = calendarScopeFlags(user.google_calendar_scopes);
    user.google_calendar_write = calendarFlags.write;
    user.google_calendar_read = calendarFlags.read;
    user.is_admin = isAdminEmail(user.email);
    user.is_internal = isInternalEmail(user.email);
    delete user.google_calendar_scopes;
    // Derived entitlement the client gates on. Keep current_period_end so the UI
    // can show "Pro until <date>" for canceled/past-due subscriptions.
    user.plan = isProActive(user) ? 'pro' : 'free';
    const ageS = Math.floor(Date.now() / 1000) - (payload.iat || 0);
    const token = ageS > TOKEN_RENEW_AFTER_S
      ? jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
      : undefined;
    return res.json({ user, ...(token ? { token } : {}) });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Google Calendar connection routes (require auth)
router.get('/google-calendar/status', requireAuth, async (req, res) => {
  try {
    const connected = await isCalendarConnected(req.user.id);
    res.json({ connected });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/google-calendar', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    const tokens = await exchangeCodeForTokens(code);
    // If Google didn't return a refresh_token (re-authorization), keep the existing one
    if (tokens.refresh_token) {
      await pool.query(
        'UPDATE users SET google_calendar_access_token = $1, google_calendar_refresh_token = $2, google_calendar_token_expiry = $3, google_calendar_scopes = $4 WHERE id = $5',
        [tokens.access_token, tokens.refresh_token, String(tokens.expiry_date), tokens.scope, req.user.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET google_calendar_access_token = $1, google_calendar_token_expiry = $2, google_calendar_scopes = $3 WHERE id = $4',
        [tokens.access_token, String(tokens.expiry_date), tokens.scope, req.user.id]
      );
    }
    const flags = calendarScopeFlags(tokens.scope);
    const granted = (tokens.scope || '').split(/\s+/).filter(s => s.includes('calendar')).map(s => s.split('/').pop());
    console.log(`[gcal] connect user=${req.user.id} scopes=${granted.join(',') || 'none'} refresh=${tokens.refresh_token ? 'new' : 'none'} expiry=${tokens.expiry_date}`);
    const syncing = flags.write ? await syncUpcomingTasks(req.user.id, req.today, req.clientTimezone) : 0;
    res.json({ connected: true, hasWriteScope: flags.write, hasReadScope: flags.read, syncing });
  } catch (error) {
    console.error('Google Calendar connect error:', error);
    res.status(400).json({ error: 'Failed to connect Google Calendar' });
  }
});

router.delete('/google-calendar', requireAuth, async (req, res) => {
  try {
    await revokeCalendarAccess(req.user.id);
    res.json({ connected: false });
  } catch (error) {
    console.error('Google Calendar disconnect error:', error);
    serverError(req, res, error);
  }
});

// GDPR Art. 17 right-to-erasure. Deletes the account and all its data.
// External side effects (cancel Paddle sub, revoke Google token) are
// best-effort and must not block the local erasure. The users row delete
// cascades to every user-scoped table (see migration 1782400000000).
router.delete('/account', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    // Best-effort external cleanup — log failures but proceed with erasure.
    let email = null;
    try {
      const { rows } = await pool.query('SELECT email, paddle_subscription_id FROM users WHERE id = $1', [userId]);
      email = rows[0]?.email || null;
      const subId = rows[0]?.paddle_subscription_id;
      if (subId) await cancelSubscription(subId);
    } catch (err) {
      console.error('Account deletion: Paddle cancel failed (continuing):', err.message);
    }
    // The legacy waitlist row is the one piece of this person's data outside
    // the users cascade; erasure means it goes too.
    if (email) {
      await pool.query('DELETE FROM waitlist WHERE email = $1', [email]).catch(err =>
        console.error('Account deletion: waitlist cleanup failed (continuing):', err.message));
    }
    try {
      await revokeCalendarAccess(userId);
    } catch (err) {
      console.error('Account deletion: Google revoke failed (continuing):', err.message);
    }

    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Account deletion error:', error);
    serverError(req, res, error);
  }
});

export default router;
