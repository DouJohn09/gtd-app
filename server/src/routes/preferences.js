import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AI_MODES } from '../services/userPrefs.js';

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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
