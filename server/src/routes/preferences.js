import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AI_MODES } from '../services/userPrefs.js';
import { serverError } from '../lib/httpErrors.js';

const router = Router();

router.put('/ai-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (!AI_MODES.includes(mode)) {
      return res.status(400).json({ error: 'Invalid AI mode' });
    }
    await pool.query('UPDATE users SET ai_mode = $1 WHERE id = $2', [mode, req.user.id]);
    res.json({ ai_mode: mode });
  } catch (error) {
    console.error('Update ai_mode error:', error);
    serverError(req, res, error);
  }
});

// Marks the welcome onboarding as done (completed or skipped — either way it
// never shows again). COALESCE keeps the original timestamp on repeat calls.
router.post('/onboarding-complete', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET onboarded_at = COALESCE(onboarded_at, NOW()) WHERE id = $1 RETURNING onboarded_at',
      [req.user.id]
    );
    res.json({ onboarded_at: rows[0]?.onboarded_at ?? null });
  } catch (error) {
    console.error('Onboarding-complete error:', error);
    serverError(req, res, error);
  }
});

// Clean-accept streak behind the "turn on Autopilot?" nudge. Any adjustment
// (a deselected or edited suggestion) resets the streak rather than
// disqualifying the user forever — one correction in week one shouldn't
// permanently rule out an otherwise perfect run. Counts are clamped so a
// buggy client can't inflate the streak in one call.
router.post('/ai-feedback', async (req, res) => {
  try {
    const accepted = Math.min(100, Math.max(0, parseInt(req.body.accepted, 10) || 0));
    const adjusted = Math.min(100, Math.max(0, parseInt(req.body.adjusted, 10) || 0));
    const { rows } = adjusted > 0
      ? await pool.query(
          'UPDATE users SET ai_accept_streak = 0 WHERE id = $1 RETURNING ai_accept_streak',
          [req.user.id]
        )
      : await pool.query(
          'UPDATE users SET ai_accept_streak = ai_accept_streak + $2 WHERE id = $1 RETURNING ai_accept_streak',
          [req.user.id, accepted]
        );
    res.json({ ai_accept_streak: rows[0]?.ai_accept_streak ?? 0 });
  } catch (error) {
    console.error('AI feedback error:', error);
    serverError(req, res, error);
  }
});

// Each nudge fires at most once per account — a calm app doesn't nag.
router.post('/ai-nudge-seen', async (req, res) => {
  try {
    const col = req.body.nudge === 'autopilot' ? 'ai_nudge_autopilot_at'
      : req.body.nudge === 'reminder' ? 'ai_nudge_reminder_at'
      : null;
    if (!col) return res.status(400).json({ error: 'Invalid nudge' });
    await pool.query(`UPDATE users SET ${col} = NOW() WHERE id = $1`, [req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('AI nudge-seen error:', error);
    serverError(req, res, error);
  }
});

// Notification preferences — partial merge into the JSONB column.
function normalizeNotifPrefs(raw) {
  const d = raw || {};
  return {
    daily_email: d.daily_email !== false,
    delivery_hour: Number.isFinite(d.delivery_hour) ? d.delivery_hour : 8,
    include_due_today: d.include_due_today !== false,
    include_overdue: d.include_overdue !== false,
    include_upcoming: d.include_upcoming === true,
    include_calendar: d.include_calendar === true,
  };
}

router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [req.user.id]);
    res.json(normalizeNotifPrefs(rows[0]?.notification_prefs));
  } catch (error) {
    serverError(req, res, error);
  }
});

router.put('/notifications', async (req, res) => {
  try {
    const boolKeys = ['daily_email', 'include_due_today', 'include_overdue', 'include_upcoming', 'include_calendar'];
    const patch = {};
    for (const key of boolKeys) {
      if (key in req.body) patch[key] = Boolean(req.body[key]);
    }
    if ('delivery_hour' in req.body) {
      const h = parseInt(req.body.delivery_hour, 10);
      if (h >= 5 && h <= 22) patch.delivery_hour = h;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No valid keys' });
    await pool.query(
      'UPDATE users SET notification_prefs = notification_prefs || $1::jsonb WHERE id = $2',
      [JSON.stringify(patch), req.user.id]
    );
    const { rows } = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [req.user.id]);
    res.json(normalizeNotifPrefs(rows[0]?.notification_prefs));
  } catch (error) {
    serverError(req, res, error);
  }
});

export default router;
