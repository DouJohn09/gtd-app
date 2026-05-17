import { Router } from 'express';
import { pool } from '../db/pool.js';

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
        'SELECT habit_id FROM habit_logs WHERE user_id = $1 AND completed_date = $2',
        [req.user.id, today]
      ),
    ]);
    const completedToday = new Set(todayLogs.map(l => l.habit_id));

    const result = habits.map(h => ({
      ...h,
      target_days: h.target_days ? JSON.parse(h.target_days) : null,
      completed_today: completedToday.has(h.id),
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/habits/stats - streaks, completion rates, heatmap data
router.get('/stats', async (req, res) => {
  try {
    // Get all logs for the past 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().split('T')[0];

    const [{ rows: habits }, { rows: allLogs }] = await Promise.all([
      pool.query(
        'SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY name',
        [req.user.id]
      ),
      pool.query(
        'SELECT habit_id, completed_date FROM habit_logs WHERE user_id = $1 AND completed_date >= $2 ORDER BY completed_date',
        [req.user.id, startDate]
      ),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const habitStats = habits.map(habit => {
      const logs = allLogs.filter(l => l.habit_id === habit.id);
      const completedDates = new Set(logs.map(l => l.completed_date));

      // Calculate current streak
      let streak = 0;
      const d = new Date(today);
      while (true) {
        const dateStr = d.toISOString().split('T')[0];
        if (completedDates.has(dateStr)) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else if (dateStr === today) {
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }

      // Completion rate (last 30 days)
      let expectedDays = 0;
      let completedDays = 0;
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (isDueOn(habit, checkDate)) {
          expectedDays++;
          if (completedDates.has(dateStr)) completedDays++;
        }
      }

      return {
        id: habit.id,
        name: habit.name,
        category: habit.category,
        color: habit.color,
        streak,
        completionRate: expectedDays > 0 ? Math.round((completedDays / expectedDays) * 100) : 0,
        completedLast30: completedDays,
        expectedLast30: expectedDays,
      };
    });

    // Heatmap data: per-day completion counts for past 90 days
    const heatmap = {};
    for (const log of allLogs) {
      heatmap[log.completed_date] = (heatmap[log.completed_date] || 0) + 1;
    }

    res.json({ habits: habitStats, heatmap });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/habits - create a habit
router.post('/', async (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Habit name is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO habits (name, description, frequency, target_days, category, color, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name.trim(),
        description || null,
        frequency || 'daily',
        target_days ? JSON.stringify(target_days) : null,
        normalizeCategory(category),
        color || '#3b82f6',
        req.user.id,
      ]
    );
    const habit = rows[0];
    habit.target_days = habit.target_days ? JSON.parse(habit.target_days) : null;
    habit.completed_today = false;
    res.status(201).json(habit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/habits/:id - update a habit
router.put('/:id', async (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color, active } = req.body;

    const fields = [];
    const values = [];
    if (name !== undefined)        { fields.push(`name = $${fields.length + 1}`); values.push(name.trim()); }
    if (description !== undefined) { fields.push(`description = $${fields.length + 1}`); values.push(description || null); }
    if (frequency !== undefined)   { fields.push(`frequency = $${fields.length + 1}`); values.push(frequency); }
    if (target_days !== undefined) { fields.push(`target_days = $${fields.length + 1}`); values.push(target_days ? JSON.stringify(target_days) : null); }
    if (category !== undefined)    { fields.push(`category = $${fields.length + 1}`); values.push(normalizeCategory(category)); }
    if (color !== undefined)       { fields.push(`color = $${fields.length + 1}`); values.push(color); }
    if (active !== undefined)      { fields.push(`active = $${fields.length + 1}`); values.push(!!active); }

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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// POST /api/habits/:id/toggle - toggle completion for a date
router.post('/:id/toggle', async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];

    const { rows: existingRows } = await pool.query(
      'SELECT id FROM habit_logs WHERE habit_id = $1 AND completed_date = $2 AND user_id = $3',
      [req.params.id, date, req.user.id]
    );

    if (existingRows[0]) {
      await pool.query('DELETE FROM habit_logs WHERE id = $1', [existingRows[0].id]);
      res.json({ completed: false, date });
    } else {
      await pool.query(
        'INSERT INTO habit_logs (habit_id, completed_date, user_id) VALUES ($1, $2, $3)',
        [req.params.id, date, req.user.id]
      );
      res.json({ completed: true, date });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: check if a habit is due on a given date
function isDueOn(habit, date) {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'specific_days') {
    const days = habit.target_days ? (typeof habit.target_days === 'string' ? JSON.parse(habit.target_days) : habit.target_days) : [];
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return days.includes(dayNames[date.getDay()]);
  }
  // For weekly frequency, it's always "due" — the target is X times per week
  return true;
}

export default router;
