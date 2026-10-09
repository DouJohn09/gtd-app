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
router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [req.user.id]);
    const prefs = rows[0]?.notification_prefs || {};
    res.json({
      daily_email: prefs.daily_email !== false,
    });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.put('/notifications', async (req, res) => {
  try {
    const allowed = ['daily_email'];
    const patch = {};
    for (const key of allowed) {
      if (key in req.body) patch[key] = Boolean(req.body[key]);
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No valid keys' });
    await pool.query(
      'UPDATE users SET notification_prefs = notification_prefs || $1::jsonb WHERE id = $2',
      [JSON.stringify(patch), req.user.id]
    );
    const { rows } = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [req.user.id]);
    const prefs = rows[0]?.notification_prefs || {};
    res.json({
      daily_email: prefs.daily_email !== false,
    });
  } catch (error) {
    serverError(req, res, error);
  }
});

export default router;
