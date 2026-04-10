import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { getDb, saveDb } from '../db/schema.js';

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
    } else {
      stmt.free();
      db.run('INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)',
        [googleId, email, name, picture]);
      const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      user = { id, google_id: googleId, email, name, picture };
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
    const stmt = db.prepare('SELECT id, email, name, picture FROM users WHERE id = ?');
    stmt.bind([payload.userId]);
    if (stmt.step()) {
      const user = stmt.getAsObject();
      stmt.free();
      return res.json({ user });
    }
    stmt.free();
    return res.status(401).json({ error: 'User not found' });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
