import { Router } from 'express';
import { pool } from '../db/pool.js';
import { assertWithinLimit, LimitError } from '../services/billing.js';

const router = Router();

// Normalize category to title case
const normalizeCategory = (cat) => {
  if (!cat?.trim()) return null;
  const trimmed = cat.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// GET /api/habits - list active habits with today's completion status
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [{ rows: habits }, { rows: todayLogs }] = await Promise.all([
      pool.query(
        'SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY category, name',
        [req.user.id]
      ),
      pool.query(
        'SELECT habit_id, status FROM habit_logs WHERE user_id = $1 AND completed_date = $2',
        [req.user.id, today]
      ),
    ]);
    // habit_id → 'done' | 'skipped' for today (absent = 'none').
    const todayStatus = new Map(todayLogs.map(l => [l.habit_id, l.status]));

    const result = habits.map(h => ({
      ...h,
      target_days: h.target_days ? JSON.parse(h.target_days) : null,
      today_status: todayStatus.get(h.id) || 'none',
      completed_today: todayStatus.get(h.id) === 'done', // kept for back-compat
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/habits/stats - streaks, completion rates, heatmap data
router.get('/stats', async (req, res) => {
  try {
    // Fetch a full year of logs so streaks compute accurately. The heatmap
    // still only renders the last 90 days client-side, and completion rate
    // uses the last 30 — extra rows are harmless and habit_logs is small.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 365);
    const startDate = windowStart.toISOString().split('T')[0];

    const [{ rows: habits }, { rows: allLogs }] = await Promise.all([
      pool.query(
        'SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY name',
        [req.user.id]
      ),
      pool.query(
        'SELECT habit_id, completed_date, status FROM habit_logs WHERE user_id = $1 AND completed_date >= $2 ORDER BY completed_date',
        [req.user.id, startDate]
      ),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const habitStats = habits.map(habit => {
      const logs = allLogs.filter(l => l.habit_id === habit.id);

      let streak, streakUnit, completionRate, completedLast30, expectedLast30;
      if (habit.type === 'quit') {
        const slipSet = new Set(logs.filter(l => l.status === 'slip').map(l => l.completed_date));
        ({ streak, unit: streakUnit } = computeQuitStreak(habit, slipSet, today));
        ({ completionRate, completedLast30, expectedLast30 } = computeQuitCompletion(habit, slipSet, today, 30));
      } else {
        const completedSet = new Set(logs.filter(l => l.status === 'done').map(l => l.completed_date));
        const skippedSet = new Set(logs.filter(l => l.status === 'skipped').map(l => l.completed_date));
        ({ streak, unit: streakUnit } = computeStreak(habit, completedSet, today, skippedSet));
        ({ completionRate, completedLast30, expectedLast30 } = computeCompletion(habit, completedSet, today, 30, skippedSet));
      }

      return {
        id: habit.id,
        name: habit.name,
        category: habit.category,
        color: habit.color,
        type: habit.type,
        streak,
        streakUnit,
        completionRate,
        completedLast30,
        expectedLast30,
      };
    });

    // Heatmap data: per-day completion counts for past 90 days. Only 'done' logs
    // count — a rest day is neutral, so it shows as an empty (calm) cell, not a miss.
    const heatmap = {};
    for (const log of allLogs) {
      if (log.status !== 'done') continue;
      heatmap[log.completed_date] = (heatmap[log.completed_date] || 0) + 1;
    }

    res.json({ habits: habitStats, heatmap });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/habits/:id/logs - this habit's logged days + status, for the calendar.
router.get('/:id/logs', async (req, res) => {
  try {
    const { rows: owner } = await pool.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!owner[0]) return res.status(404).json({ error: 'Habit not found' });

    const { rows } = await pool.query(
      'SELECT completed_date, status FROM habit_logs WHERE habit_id = $1 AND user_id = $2 ORDER BY completed_date',
      [req.params.id, req.user.id]
    );
    res.json(rows.map(r => ({ date: r.completed_date, status: r.status })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/habits - create a habit
router.post('/', async (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color, type } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Habit name is required' });
    }
    await assertWithinLimit(req.user.id, 'habits');

    const { rows } = await pool.query(
      `INSERT INTO habits (name, description, frequency, target_days, category, color, type, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name.trim(),
        description || null,
        frequency || 'daily',
        target_days ? JSON.stringify(target_days) : null,
        normalizeCategory(category),
        color || '#3b82f6',
        type === 'quit' ? 'quit' : 'build',
        req.user.id,
      ]
    );
    const habit = rows[0];
    habit.target_days = habit.target_days ? JSON.parse(habit.target_days) : null;
    habit.today_status = 'none';
    habit.completed_today = false;
    res.status(201).json(habit);
  } catch (error) {
    if (error instanceof LimitError) {
      return res.status(402).json({ error: error.message, code: error.code, resource: error.resource, limit: error.limit });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/habits/:id - update a habit
router.put('/:id', async (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color, active, type } = req.body;

    const fields = [];
    const values = [];
    if (name !== undefined)        { fields.push(`name = $${fields.length + 1}`); values.push(name.trim()); }
    if (description !== undefined) { fields.push(`description = $${fields.length + 1}`); values.push(description || null); }
    if (frequency !== undefined)   { fields.push(`frequency = $${fields.length + 1}`); values.push(frequency); }
    if (target_days !== undefined) { fields.push(`target_days = $${fields.length + 1}`); values.push(target_days ? JSON.stringify(target_days) : null); }
    if (category !== undefined)    { fields.push(`category = $${fields.length + 1}`); values.push(normalizeCategory(category)); }
    if (color !== undefined)       { fields.push(`color = $${fields.length + 1}`); values.push(color); }
    if (active !== undefined)      { fields.push(`active = $${fields.length + 1}`); values.push(!!active); }
    if (type !== undefined)        { fields.push(`type = $${fields.length + 1}`); values.push(type === 'quit' ? 'quit' : 'build'); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id, req.user.id);
    const idIdx = values.length - 1;
    const userIdx = values.length;
    await pool.query(
      `UPDATE habits SET ${fields.join(', ')} WHERE id = $${idIdx} AND user_id = $${userIdx}`,
      values
    );

    const { rows } = await pool.query(
      'SELECT * FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const habit = rows[0];
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    habit.target_days = habit.target_days ? JSON.parse(habit.target_days) : null;
    res.json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', async (req, res) => {
  try {
    // habit_logs has ON DELETE CASCADE, so deleting the habit also drops its logs.
    await pool.query(
      'DELETE FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/habits/:id/toggle - cycle a date's state.
//   build habits: none → done → skipped → none ('skipped' = a neutral rest day).
//   quit habits:  none → slip → none           (a logged day is a slip; no rest).
// Returns the new state; `completed` kept for back-compat.
router.post('/:id/toggle', async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];

    const { rows: habitRows } = await pool.query(
      'SELECT type FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!habitRows[0]) return res.status(404).json({ error: 'Habit not found' });
    const isQuit = habitRows[0].type === 'quit';

    const { rows: existingRows } = await pool.query(
      'SELECT id, status FROM habit_logs WHERE habit_id = $1 AND completed_date = $2 AND user_id = $3',
      [req.params.id, date, req.user.id]
    );
    const existing = existingRows[0];

    let status;
    if (isQuit) {
      if (!existing) {
        // none → slip
        await pool.query(
          "INSERT INTO habit_logs (habit_id, completed_date, user_id, status) VALUES ($1, $2, $3, 'slip')",
          [req.params.id, date, req.user.id]
        );
        status = 'slip';
      } else {
        // slip → none
        await pool.query('DELETE FROM habit_logs WHERE id = $1', [existing.id]);
        status = 'none';
      }
    } else if (!existing) {
      // none → done
      await pool.query(
        "INSERT INTO habit_logs (habit_id, completed_date, user_id, status) VALUES ($1, $2, $3, 'done')",
        [req.params.id, date, req.user.id]
      );
      status = 'done';
    } else if (existing.status === 'done') {
      // done → skipped
      await pool.query("UPDATE habit_logs SET status = 'skipped' WHERE id = $1", [existing.id]);
      status = 'skipped';
    } else {
      // skipped → none
      await pool.query('DELETE FROM habit_logs WHERE id = $1', [existing.id]);
      status = 'none';
    }

    res.json({ status, completed: status === 'done', date });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Stats helpers (schedule-aware). Exported for unit testing.
//
// Streaks and completion rate must respect each habit's schedule. The previous
// implementation counted consecutive *calendar* days, so a 3×/week or
// specific-days habit could never hold a streak — any non-scheduled day with no
// log broke the chain. These helpers skip non-scheduled days and treat weekly
// (X-times-per-week) habits as a per-week target.
//
// All date math is UTC on 'YYYY-MM-DD' strings, matching how DATE columns are
// returned (db/pool.js) and how `today` is computed in the handlers.
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function addDaysStr(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dowUTC(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun … 6=Sat
}

function parseTargetDays(habit) {
  const t = habit.target_days;
  if (!t) return [];
  return typeof t === 'string' ? JSON.parse(t) : t;
}

// Weekly target = X times per week (the modal stores it as target_days[0]).
function weeklyTarget(habit) {
  return Math.max(1, parseInt(parseTargetDays(habit)[0], 10) || 1);
}

// Interval length N = "every N days" (stored in target_days[0], like weekly).
// Minimum 2 — "every 1 day" is just `daily`.
function intervalN(habit) {
  return Math.max(2, parseInt(parseTargetDays(habit)[0], 10) || 2);
}

// Interval habits are anchored to their creation date (UTC): due on the anchor
// and every Nth day after. created_at may arrive as a Date (pg) or a string.
function anchorDateStr(habit) {
  const c = habit.created_at;
  if (!c) return null;
  return (c instanceof Date ? c.toISOString() : String(c)).slice(0, 10);
}

function daysBetweenStr(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

// Monday-based start of the week containing dateStr.
function startOfWeekStr(dateStr) {
  const dow = dowUTC(dateStr);
  const sinceMonday = dow === 0 ? 6 : dow - 1;
  return addDaysStr(dateStr, -sinceMonday);
}

function countCompletedInWeek(completedSet, weekStartStr) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if (completedSet.has(addDaysStr(weekStartStr, i))) n++;
  }
  return n;
}

// Is this habit scheduled on the given date? Daily/specific_days/interval have
// fixed due-days; weekly habits have no fixed days and are handled per-week
// elsewhere. Because streak/completion only special-case weekly and otherwise
// loop over isDueOn, teaching this function about intervals is all that's needed.
export function isDueOn(habit, dateStr) {
  if (habit.frequency === 'specific_days') {
    return parseTargetDays(habit).includes(DAY_NAMES[dowUTC(dateStr)]);
  }
  if (habit.frequency === 'interval') {
    const anchor = anchorDateStr(habit);
    if (!anchor) return false;
    const diff = daysBetweenStr(anchor, dateStr);
    return diff >= 0 && diff % intervalN(habit) === 0; // on the anchor or every Nth day after
  }
  return habit.frequency === 'daily';
}

// Current streak. daily/specific_days → consecutive *scheduled* days completed
// (non-scheduled days skipped; an unfinished today doesn't break it). weekly →
// consecutive weeks that met the X-times target. Returns the count and its unit
// ('day' | 'week') so the UI can label "5 d" vs "5 wk".
//
// `skippedSet` holds days the user marked as a deliberate rest. A skipped due-day
// is treated like a non-scheduled day: neutral — it neither extends nor breaks
// the streak. Skip is a no-op for weekly habits (their target is per-week, not
// per-day), so skippedSet is ignored there.
export function computeStreak(habit, completedSet, todayStr, skippedSet = new Set()) {
  if (habit.frequency === 'weekly') {
    const target = weeklyTarget(habit);
    const currentWeek = startOfWeekStr(todayStr);
    let streak = 0;
    let week = currentWeek;
    for (let guard = 0; guard < 104; guard++) {
      if (countCompletedInWeek(completedSet, week) >= target) {
        streak++;
      } else if (week !== currentWeek) {
        break; // the current week may still be in progress, so it never breaks
      }
      week = addDaysStr(week, -7);
    }
    return { streak, unit: 'week' };
  }

  let streak = 0;
  let cursor = todayStr;
  // Bounded loop: also prevents an infinite loop for a specific_days habit with
  // no target days (isDueOn always false).
  for (let guard = 0; guard < 366; guard++) {
    if (isDueOn(habit, cursor)) {
      if (completedSet.has(cursor)) streak++;
      else if (skippedSet.has(cursor)) { /* rest day — neutral, keep looking back */ }
      else if (cursor !== todayStr) break; // a missed past due-day ends the streak
      // else: due today but not done yet — don't penalize, keep looking back
    }
    cursor = addDaysStr(cursor, -1);
  }
  return { streak, unit: 'day' };
}

// Completion rate over the last `windowDays`. daily/specific_days count
// scheduled days; weekly counts logged completions against the pro-rated weekly
// target. Rate clamped to 0–100.
//
// A skipped due-day is excluded from `expected` entirely (it's a rest day, not a
// miss), so resting never drags the rate down. Skip is a no-op for weekly habits.
export function computeCompletion(habit, completedSet, todayStr, windowDays = 30, skippedSet = new Set()) {
  if (habit.frequency === 'weekly') {
    const target = weeklyTarget(habit);
    let completed = 0;
    for (let i = 0; i < windowDays; i++) {
      if (completedSet.has(addDaysStr(todayStr, -i))) completed++;
    }
    const expected = Math.max(1, Math.round((windowDays / 7) * target));
    return {
      completionRate: Math.min(100, Math.round((completed / expected) * 100)),
      completedLast30: completed,
      expectedLast30: expected,
    };
  }

  let expected = 0;
  let completed = 0;
  for (let i = 0; i < windowDays; i++) {
    const ds = addDaysStr(todayStr, -i);
    if (isDueOn(habit, ds) && !skippedSet.has(ds)) {
      expected++;
      if (completedSet.has(ds)) completed++;
    }
  }
  return {
    completionRate: expected > 0 ? Math.round((completed / expected) * 100) : 0,
    completedLast30: completed,
    expectedLast30: expected,
  };
}

// ---------------------------------------------------------------------------
// Quit-habit stats. A "quit" habit succeeds by abstinence: a log is a *slip*,
// and every day is implicitly a clean day unless it has a slip. These count
// calendar days (frequency doesn't apply to abstinence) and are bounded by the
// creation anchor — there are no clean days before the habit existed.
// ---------------------------------------------------------------------------

// Consecutive clean days ending today. Today counts as clean unless slipped; a
// slip ends the streak; we stop at the creation anchor.
export function computeQuitStreak(habit, slipSet, todayStr) {
  const anchor = anchorDateStr(habit);
  let streak = 0;
  let cursor = todayStr;
  for (let guard = 0; guard < 3660; guard++) {
    if (anchor && cursor < anchor) break; // before the habit existed
    if (slipSet.has(cursor)) break;       // a slip ends the clean run
    streak++;
    cursor = addDaysStr(cursor, -1);
  }
  return { streak, unit: 'day' };
}

// Clean-day rate over the last `windowDays`, counting only days since creation.
// `completedLast30`/`expectedLast30` carry clean-days / total-days for the UI.
export function computeQuitCompletion(habit, slipSet, todayStr, windowDays = 30) {
  const anchor = anchorDateStr(habit);
  let total = 0;
  let clean = 0;
  for (let i = 0; i < windowDays; i++) {
    const ds = addDaysStr(todayStr, -i);
    if (anchor && ds < anchor) continue; // habit didn't exist yet
    total++;
    if (!slipSet.has(ds)) clean++;
  }
  return {
    completionRate: total > 0 ? Math.round((clean / total) * 100) : 100,
    completedLast30: clean,
    expectedLast30: total,
  };
}

export default router;
