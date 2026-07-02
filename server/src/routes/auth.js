import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { exchangeCodeForTokens, revokeCalendarAccess, isCalendarConnected } from '../services/googleCalendar.js';
import { isProActive } from '../services/billing.js';
import { cancelSubscription } from '../services/paddle.js';
import { isValidTimezone } from '../lib/dateTime.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Login attempts only — /me is hit on every app load and must stay unthrottled
// (shared NAT / office IPs would lock legit users out). 20 per 15min per IP is
// far above any honest login pattern. Needs `trust proxy` (set in index.js) so
// req.ip is the real client behind Railway's proxy.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/google', loginLimiter, async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    // Capture the browser timezone (forwarded via X-Client-Timezone) so
    // server-side "today" is the user's local day. null = leave as-is.
    const tz = isValidTimezone(req.clientTimezone) ? req.clientTimezone : null;

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );
    let user;

    if (existingRows[0]) {
      user = existingRows[0];
      await pool.query(
        'UPDATE users SET last_login = NOW(), name = $1, picture = $2, timezone = COALESCE($3, timezone) WHERE id = $4',
        [name, picture, tz, user.id]
      );

      // Seed default contexts for existing users who don't have any
      const { rows: ctxCountRows } = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM contexts WHERE user_id = $1',
        [user.id]
      );
      if ((ctxCountRows[0]?.cnt ?? 0) === 0) {
        const defaultContexts = ['@home', '@work', '@errands', '@computer', '@phone', '@anywhere'];
        await Promise.all(defaultContexts.map(ctx =>
          pool.query('INSERT INTO contexts (name, user_id) VALUES ($1, $2)', [ctx, user.id])
        ));
      }
    } else {
      const { rows: insertRows } = await pool.query(
        'INSERT INTO users (google_id, email, name, picture, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [googleId, email, name, picture, tz]
      );
      const id = insertRows[0].id;
      user = { id, google_id: googleId, email, name, picture };

      // Seed default contexts for new user
      const defaultContexts = ['@home', '@work', '@errands', '@computer', '@phone', '@anywhere'];
      await Promise.all(defaultContexts.map(ctx =>
        pool.query('INSERT INTO contexts (name, user_id) VALUES ($1, $2)', [ctx, id])
      ));
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, picture: user.picture }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, email, name, picture,
              (google_calendar_refresh_token IS NOT NULL OR google_calendar_access_token IS NOT NULL) AS google_calendar_connected,
              google_calendar_scopes,
              plan, subscription_status, current_period_end
       FROM users WHERE id = $1`,
      [payload.userId]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    user.google_calendar_connected = !!user.google_calendar_connected;
    user.google_calendar_write = (user.google_calendar_scopes || '').includes('https://www.googleapis.com/auth/calendar');
    delete user.google_calendar_scopes;
    // Derived entitlement the client gates on. Keep current_period_end so the UI
    // can show "Pro until <date>" for canceled/past-due subscriptions.
    user.plan = isProActive(user) ? 'pro' : 'free';
    return res.json({ user });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    res.json({ connected: true, hasWriteScope: (tokens.scope || '').includes('https://www.googleapis.com/auth/calendar') });
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
    res.status(500).json({ error: 'Internal server error' });
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
    try {
      const { rows } = await pool.query('SELECT paddle_subscription_id FROM users WHERE id = $1', [userId]);
      const subId = rows[0]?.paddle_subscription_id;
      if (subId) await cancelSubscription(subId);
    } catch (err) {
      console.error('Account deletion: Paddle cancel failed (continuing):', err.message);
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
