import { pool } from '../db/pool.js';

export const AI_MODES = ['off', 'assisted', 'auto'];

// The user's AI mode drives server-side behavior (smart-capture routing,
// weekly-review analysis), not just UI visibility — a stale or hostile client
// must not be able to run AI for a user who turned it off. Fails safe to
// 'assisted' (the default) on any read error.
export async function getAiMode(userId) {
  try {
    const { rows } = await pool.query('SELECT ai_mode FROM users WHERE id = $1', [userId]);
    const mode = rows[0]?.ai_mode;
    return AI_MODES.includes(mode) ? mode : 'assisted';
  } catch (err) {
    console.error('getAiMode failed (defaulting to assisted):', err);
    return 'assisted';
  }
}
