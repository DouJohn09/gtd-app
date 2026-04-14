import { Router } from 'express';
import { getDb, saveDb } from '../db/schema.js';

const router = Router();

// Normalize category to title case
const normalizeCategory = (cat) => {
  if (!cat?.trim()) return null;
  const trimmed = cat.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// Helper to get rows as objects
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// GET /api/habits - list active habits with today's completion status
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const habits = queryAll(db,
      'SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY category, name',
      [req.user.id]
    );

    // Get today's completions
    const todayLogs = queryAll(db,
      'SELECT habit_id FROM habit_logs WHERE user_id = ? AND completed_date = ?',
      [req.user.id, today]
    );
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
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const habits = queryAll(db,
      'SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY name',
      [req.user.id]
    );

    // Get all logs for the past 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().split('T')[0];

    const allLogs = queryAll(db,
      'SELECT habit_id, completed_date FROM habit_logs WHERE user_id = ? AND completed_date >= ? ORDER BY completed_date',
      [req.user.id, startDate]
    );

    // Build per-habit stats
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
          // Today not yet completed, check yesterday
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }

      // Completion rate (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
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
router.post('/', (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Habit name is required' });
    }

    const db = getDb();
    db.run(
      'INSERT INTO habits (name, description, frequency, target_days, category, color, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), description || null, frequency || 'daily', target_days ? JSON.stringify(target_days) : null, normalizeCategory(category), color || '#3b82f6', req.user.id]
    );
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    saveDb();

    const habit = queryOne(db, 'SELECT * FROM habits WHERE id = ?', [id]);
    habit.target_days = habit.target_days ? JSON.parse(habit.target_days) : null;
    habit.completed_today = false;
    res.status(201).json(habit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/habits/:id - update a habit
router.put('/:id', (req, res) => {
  try {
    const { name, description, frequency, target_days, category, color, active } = req.body;
    const db = getDb();

    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
    if (frequency !== undefined) { fields.push('frequency = ?'); values.push(frequency); }
    if (target_days !== undefined) { fields.push('target_days = ?'); values.push(target_days ? JSON.stringify(target_days) : null); }
    if (category !== undefined) { fields.push('category = ?'); values.push(normalizeCategory(category)); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id, req.user.id);
    db.run(`UPDATE habits SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    saveDb();

    const habit = queryOne(db, 'SELECT * FROM habits WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    habit.target_days = habit.target_days ? JSON.parse(habit.target_days) : null;
    res.json(habit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM habit_logs WHERE habit_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    db.run('DELETE FROM habits WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    saveDb();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/habits/:id/toggle - toggle completion for a date
router.post('/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const date = req.body.date || new Date().toISOString().split('T')[0];

    // Check if already logged
    const existing = queryOne(db,
      'SELECT id FROM habit_logs WHERE habit_id = ? AND completed_date = ? AND user_id = ?',
      [req.params.id, date, req.user.id]
    );

    if (existing) {
      db.run('DELETE FROM habit_logs WHERE id = ?', [existing.id]);
    } else {
      db.run(
        'INSERT INTO habit_logs (habit_id, completed_date, user_id) VALUES (?, ?, ?)',
        [req.params.id, date, req.user.id]
      );
    }
    saveDb();

    res.json({ completed: !existing, date });
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
