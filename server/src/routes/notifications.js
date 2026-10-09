import { Router } from 'express';
import { pool } from '../db/pool.js';
import { verifyUnsubToken } from '../services/notifications.js';
import { serverError } from '../lib/httpErrors.js';

const router = Router();

// Public — one-click unsubscribe (no auth needed, token-verified)
router.get('/unsubscribe', async (req, res) => {
  const userId = parseInt(req.query.u, 10);
  const token = String(req.query.t || '');
  if (!userId || !verifyUnsubToken(userId, token)) {
    return res.status(400).send('Invalid unsubscribe link.');
  }
  try {
    await pool.query(
      `UPDATE users SET notification_prefs = notification_prefs || '{"daily_email": false}'::jsonb WHERE id = $1`,
      [userId]
    );
    res.send(`
      <html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#1a1a22;color:#e5e5e5;">
        <div style="text-align:center;max-width:400px;">
          <h2>Unsubscribed</h2>
          <p>You won't receive daily task emails anymore.</p>
          <p>You can re-enable them anytime in <a href="https://cleartable.app/app/settings" style="color:#7c6cff;">Settings</a>.</p>
        </div>
      </body></html>
    `);
  } catch (err) {
    serverError(req, res, err);
  }
});

export default router;
