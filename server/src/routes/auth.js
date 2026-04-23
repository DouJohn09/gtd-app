import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { getDb, saveDb } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { exchangeCodeForTokens, revokeCalendarAccess, isCalendarConnected } from '../services/googleCalendar.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const db = getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE google_id = ?');
    stmt.bind([googleId]);
    let user;

    if (stmt.step()) {
      user = stmt.getAsObject();
      stmt.free();
      db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP, name = ?, picture = ? WHERE id = ?',
        [name, picture, user.id]);

      // Seed default contexts for existing users who don't have any
      const ctxCount = db.exec(`SELECT COUNT(*) FROM contexts WHERE user_id = ${user.id}`);
      if (ctxCount[0]?.values[0][0] === 0) {
        const defaultContexts = ['@home', '@work', '@errands', '@computer', '@phone', '@anywhere'];
        for (const ctx of defaultContexts) {
          db.run('INSERT INTO contexts (name, user_id) VALUES (?, ?)', [ctx, user.id]);
        }
      }
    } else {
      stmt.free();
      db.run('INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)',
        [googleId, email, name, picture]);
      const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      user = { id, google_id: googleId, email, name, picture };

      // Seed default contexts for new user
      const defaultContexts = ['@home', '@work', '@errands', '@computer', '@phone', '@anywhere'];
      for (const ctx of defaultContexts) {
        db.run('INSERT INTO contexts (name, user_id) VALUES (?, ?)', [ctx, id]);
      }
    }
    saveDb();

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

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const db = getDb();
    const stmt = db.prepare('SELECT id, email, name, picture, (google_calendar_refresh_token IS NOT NULL OR google_calendar_access_token IS NOT NULL) as google_calendar_connected, google_calendar_scopes FROM users WHERE id = ?');
    stmt.bind([payload.userId]);
    if (stmt.step()) {
      const user = stmt.getAsObject();
      stmt.free();
      user.google_calendar_connected = !!user.google_calendar_connected;
      user.google_calendar_write = (user.google_calendar_scopes || '').includes('https://www.googleapis.com/auth/calendar');
      delete user.google_calendar_scopes;
      return res.json({ user });
    }
    stmt.free();
    return res.status(401).json({ error: 'User not found' });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Google Calendar connection routes (require auth)
router.get('/google-calendar/status', requireAuth, (req, res) => {
  try {
    const connected = isCalendarConnected(req.user.id);
    res.json({ connected });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/google-calendar', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    const tokens = await exchangeCodeForTokens(code);
    const db = getDb();
    // If Google didn't return a refresh_token (re-authorization), keep the existing one
    if (tokens.refresh_token) {
      db.run(
        'UPDATE users SET google_calendar_access_token = ?, google_calendar_refresh_token = ?, google_calendar_token_expiry = ?, google_calendar_scopes = ? WHERE id = ?',
        [tokens.access_token, tokens.refresh_token, tokens.expiry_date, tokens.scope, req.user.id]
      );
    } else {
      db.run(
        'UPDATE users SET google_calendar_access_token = ?, google_calendar_token_expiry = ?, google_calendar_scopes = ? WHERE id = ?',
        [tokens.access_token, tokens.expiry_date, tokens.scope, req.user.id]
      );
    }
    saveDb();
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
