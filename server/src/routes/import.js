import express from 'express';
import { pool } from '../db/pool.js';
import { remainingAllowance } from '../services/billing.js';

const router = express.Router();

// ─── Parsing helpers ──────────────────────────────────────────────────────────

// CSV parser: handles quoted fields with embedded commas, newlines, and "" escapes.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// Todoist priority (1=highest, 4=none) → ours (4=highest, 0=none)
function mapPriorityFromTodoist(p) {
  const n = parseInt(p, 10);
  if (!n || n >= 4) return 0;
  if (n === 3) return 2;
  if (n === 2) return 3;
  return 4;
}

// "YYYY-MM-DD HH:MM" or "YYYY-MM-DD" → { due_date, scheduled_time }
function parseDate(s) {
  if (!s) return { due_date: null, scheduled_time: null };
  const m = String(s).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
  if (!m) return { due_date: null, scheduled_time: null };
  return { due_date: m[1], scheduled_time: m[2] || null };
}

// Recurrence form we emit on export: "daily", "daily/2", "weekly:mon,wed"
function parseRecurrence(s) {
  if (!s) return { rule: null, interval: null, days: null };
  const m = String(s).trim().match(/^([a-z]+)(?:\/(\d+))?(?::(.+))?$/i);
  if (!m) return { rule: null, interval: null, days: null };
  return {
    rule: m[1].toLowerCase(),
    interval: m[2] ? parseInt(m[2], 10) : 1,
    days: m[3] || null,
  };
}

function buildTasksFromCSV(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.toUpperCase().trim());
  const idx = (name) => headers.indexOf(name);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (col) => {
      const j = idx(col);
      return j >= 0 && j < row.length ? (row[j] || '').trim() : '';
    };
    const type = (get('TYPE') || 'task').toLowerCase();
    if (type !== 'task') continue;
    const title = get('CONTENT');
    if (!title) continue;

    const { due_date, scheduled_time } = parseDate(get('DATE'));
    const completed = get('COMPLETED').toLowerCase() === 'true';
    const rec = parseRecurrence(get('RECURRENCE'));

    out.push({
      title,
      notes: get('DESCRIPTION').replace(/\\n/g, '\n') || null,
      list: completed ? 'completed' : (get('LIST') || 'inbox'),
      context: get('CONTEXT') || null,
      project_name: get('PROJECT') || null,
      waiting_for_person: get('WAITING_FOR') || null,
      due_date,
      scheduled_time,
      energy_level: get('ENERGY') || null,
      time_estimate: parseInt(get('TIME_ESTIMATE'), 10) || null,
      priority: mapPriorityFromTodoist(get('PRIORITY')),
      completed_at: get('COMPLETED_AT') || (completed ? new Date().toISOString() : null),
      recurrence_rule: rec.rule,
      recurrence_interval: rec.interval,
      recurrence_days: rec.days,
    });
  }
  return out;
}

// ─── Preview ─────────────────────────────────────────────────────────────────

router.post('/preview', async (req, res) => {
  try {
    const { filename, content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'No content' });
    }
    const ext = (filename || '').toLowerCase().split('.').pop();
    const looksJson = ext === 'json' || content.trim().startsWith('{');
    const looksCsv = ext === 'csv' || /^[A-Z_]+,/.test(content.trim());

    const { rows: existingProjects } = await pool.query('SELECT name FROM projects WHERE user_id = $1', [req.user.id]);
    const existingNames = new Set(existingProjects.map(p => (p.name || '').toLowerCase()));

    if (looksJson) {
      let payload;
      try { payload = JSON.parse(content); }
      catch { return res.status(400).json({ error: 'Invalid JSON' }); }
      if (payload.app !== 'Cleartable' && payload.app !== 'GTD Flow') {
        return res.status(400).json({ error: 'Not a Cleartable JSON export' });
      }
      const incomingProjects = payload.projects || [];
      const projects_new = incomingProjects.filter(p => !existingNames.has((p.name || '').toLowerCase())).length;
      const projects_merge = incomingProjects.length - projects_new;
      return res.json({
        format: 'gtdflow-json',
        summary: {
          tasks: (payload.tasks || []).length,
          projects: incomingProjects.length,
          projects_new,
          projects_merge,
          contexts: (payload.contexts || []).length,
          habits: (payload.habits || []).length,
          habit_logs: (payload.habit_logs || []).length,
          custom_lists: (payload.custom_lists || []).length,
          list_items: (payload.list_items || []).length,
          weekly_reviews: (payload.weekly_reviews || []).length,
        },
        sample: (payload.tasks || []).slice(0, 5).map(t => t.title),
        payload,
      });
    }

    if (looksCsv) {
      const rows = parseCSV(content);
      if (!rows.length) return res.status(400).json({ error: 'Empty CSV' });
      const tasks = buildTasksFromCSV(rows);
      const projectNames = [...new Set(tasks.map(t => t.project_name).filter(Boolean))];
      const projects_new = projectNames.filter(n => !existingNames.has(n.toLowerCase())).length;
      const projects_merge = projectNames.length - projects_new;
      return res.json({
        format: 'csv',
        summary: {
          tasks: tasks.length,
          projects: projectNames.length,
          projects_new,
          projects_merge,
        },
        sample: tasks.slice(0, 5).map(t => t.title),
        payload: { tasks },
      });
    }

    return res.status(400).json({
      error: 'Unsupported file. Use a Cleartable JSON export or a Todoist-compatible CSV.',
    });
  } catch (err) {
    console.error('Import preview failed:', err);
    res.status(500).json({ error: 'Failed to preview import' });
  }
});

// ─── Commit ──────────────────────────────────────────────────────────────────
//
// One transaction: either the whole file lands or nothing does, so a bad row
// half-way through can't leave a partial import that a retry then duplicates.
// Values that would trip a CHECK constraint are coerced to safe defaults up
// front (a hand-edited or foreign JSON should import, not 500).

const MAX_ROWS = 5000; // per collection; a 1 MB body is ~8k tasks, this bounds the query count
const TASK_LISTS = new Set(['inbox', 'next_actions', 'waiting_for', 'someday_maybe', 'completed']);
const ENERGY = new Set(['low', 'medium', 'high']);
const HABIT_FREQ = new Set(['daily', 'weekly', 'specific_days', 'interval']);
const HABIT_TYPES = new Set(['build', 'quit']);
const LOG_STATUS = new Set(['done', 'skipped', 'slip']);
const ITEM_STATUS = new Set(['todo', 'in_progress', 'done']);
const RECURRENCE_TYPES = new Set(['absolute', 'relative']);

const oneOf = (set, v, fallback) => (set.has(v) ? v : fallback);
const dateOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const tsOrNull = (v) => {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const intOrNull = (v) => (Number.isInteger(v) ? v : (Number.isInteger(parseInt(v, 10)) ? parseInt(v, 10) : null));
const clamp = (v, lo, hi, fallback) => {
  const n = intOrNull(v);
  return n == null ? fallback : Math.min(hi, Math.max(lo, n));
};
const cap = (arr) => (Array.isArray(arr) ? arr.slice(0, MAX_ROWS) : []);

async function insertTaskRaw(client, task, userId) {
  const title = typeof task.title === 'string' ? task.title.trim() : '';
  if (!title) return null;
  const { rows } = await client.query(
    `INSERT INTO tasks (
      title, notes, list, context, project_id, waiting_for_person,
      due_date, start_date, scheduled_time, duration, energy_level, time_estimate,
      priority, is_daily_focus, position, recurrence_rule, recurrence_interval,
      recurrence_days, recurrence_type, completed_at, user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    RETURNING id`,
    [
      title,
      task.notes || null,
      oneOf(TASK_LISTS, task.list, 'inbox'),
      task.context || null,
      task.project_id || null,
      task.waiting_for_person || null,
      dateOrNull(task.due_date),
      dateOrNull(task.start_date),
      task.scheduled_time || null,
      intOrNull(task.duration),
      oneOf(ENERGY, task.energy_level, null),
      intOrNull(task.time_estimate),
      clamp(task.priority, 0, 4, 0),
      !!task.is_daily_focus,
      intOrNull(task.position) ?? 0,
      task.recurrence_rule || null,
      intOrNull(task.recurrence_interval) || 1,
      task.recurrence_days || null,
      oneOf(RECURRENCE_TYPES, task.recurrence_type, 'absolute'),
      tsOrNull(task.completed_at),
      userId,
    ]
  );
  return rows[0].id;
}

export async function commitImport(client, userId, format, payload) {
  const counts = {
    tasks: 0, projects_new: 0, projects_merged: 0, projects_skipped: 0, contexts: 0,
    habits: 0, habits_skipped: 0, habit_logs: 0,
    custom_lists: 0, custom_lists_merged: 0, custom_lists_skipped: 0, list_items: 0, weekly_reviews: 0,
  };

  // Free-tier caps apply to import too, or a hand-edited export JSON is a gate
  // bypass. Merges into existing projects/habits/lists don't consume budget;
  // only new rows do. Over budget → skip and count, never fail the import.
  let projectBudget = await remainingAllowance(userId, 'projects');

  const { rows: existingProjects } = await client.query('SELECT id, name FROM projects WHERE user_id = $1', [userId]);
  const projectIdByName = new Map(existingProjects.map(p => [(p.name || '').toLowerCase(), p.id]));
  async function resolveProject(name, shape) {
    if (!name || typeof name !== 'string') return null;
    const key = name.toLowerCase();
    if (projectIdByName.has(key)) return { id: projectIdByName.get(key), merged: true };
    if (projectBudget <= 0) { counts.projects_skipped++; return null; }
    const { rows } = await client.query(
      'INSERT INTO projects (name, description, outcome, execution_mode, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, shape?.description || null, shape?.outcome || null,
       shape?.execution_mode === 'sequential' ? 'sequential' : 'parallel', userId]
    );
    projectBudget--;
    projectIdByName.set(key, rows[0].id);
    return { id: rows[0].id, merged: false };
  }

  if (format === 'gtdflow-json') {
    const oldToNewProjectId = new Map();
    for (const p of cap(payload.projects)) {
      const r = await resolveProject(p.name, p);
      if (!r) continue;
      if (r.merged) counts.projects_merged++; else counts.projects_new++;
      oldToNewProjectId.set(p.id, r.id);
    }

    const { rows: ctxRows } = await client.query('SELECT name FROM contexts WHERE user_id = $1', [userId]);
    const existingCtx = new Set(ctxRows.map(r => r.name));
    for (const c of cap(payload.contexts)) {
      if (!c.name || typeof c.name !== 'string' || existingCtx.has(c.name)) continue;
      await client.query('INSERT INTO contexts (name, user_id) VALUES ($1, $2)', [c.name, userId]);
      existingCtx.add(c.name);
      counts.contexts++;
    }

    // Habits (merge by name; map old→new id for log import). v1 exports have no
    // `type`, so they default to 'build' — which is what every v1 habit was.
    const { rows: habitRows } = await client.query('SELECT id, name FROM habits WHERE user_id = $1', [userId]);
    const habitIdByName = new Map(habitRows.map(r => [(r.name || '').toLowerCase(), r.id]));
    const oldToNewHabitId = new Map();
    let habitBudget = await remainingAllowance(userId, 'habits');
    for (const h of cap(payload.habits)) {
      if (!h.name || typeof h.name !== 'string') continue;
      const key = h.name.toLowerCase();
      if (habitIdByName.has(key)) { oldToNewHabitId.set(h.id, habitIdByName.get(key)); continue; }
      const willBeActive = !!(h.active ?? true);
      if (willBeActive && habitBudget <= 0) { counts.habits_skipped++; continue; }
      const { rows } = await client.query(
        `INSERT INTO habits (name, description, type, frequency, target_days, category, color, active, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [h.name, h.description || null, oneOf(HABIT_TYPES, h.type, 'build'),
         oneOf(HABIT_FREQ, h.frequency, 'daily'),
         typeof h.target_days === 'string' ? h.target_days : (h.target_days ? JSON.stringify(h.target_days) : null),
         h.category || null, h.color || '#3b82f6', willBeActive, userId]
      );
      habitIdByName.set(key, rows[0].id);
      oldToNewHabitId.set(h.id, rows[0].id);
      if (willBeActive) habitBudget--;
      counts.habits++;
    }

    // Habit logs keep status (done/skipped/slip) + note; v1 rows are plain 'done'.
    for (const log of cap(payload.habit_logs)) {
      const newHabitId = oldToNewHabitId.get(log.habit_id);
      const date = dateOrNull(log.completed_date);
      if (!newHabitId || !date) continue;
      const { rowCount } = await client.query(
        `INSERT INTO habit_logs (habit_id, completed_date, status, note, user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (habit_id, completed_date) DO NOTHING`,
        [newHabitId, date, oneOf(LOG_STATUS, log.status, 'done'), log.note || null, userId]
      );
      counts.habit_logs += rowCount;
    }

    // Tasks — append-only, map project ids; remember new ids for list items.
    const oldToNewTaskId = new Map();
    for (const t of cap(payload.tasks)) {
      const id = await insertTaskRaw(client, {
        ...t,
        project_id: t.project_id ? oldToNewProjectId.get(t.project_id) || null : null,
      }, userId);
      if (id == null) continue;
      if (t.id != null) oldToNewTaskId.set(t.id, id);
      counts.tasks++;
    }

    // Custom lists (merge by name, capped like projects) + their items.
    const { rows: listRows } = await client.query('SELECT id, name FROM custom_lists WHERE user_id = $1', [userId]);
    const listIdByName = new Map(listRows.map(r => [(r.name || '').toLowerCase(), r.id]));
    const oldToNewListId = new Map();
    let listBudget = await remainingAllowance(userId, 'custom_lists');
    for (const l of cap(payload.custom_lists)) {
      if (!l.name || typeof l.name !== 'string') continue;
      const key = l.name.toLowerCase();
      if (listIdByName.has(key)) { oldToNewListId.set(l.id, listIdByName.get(key)); counts.custom_lists_merged++; continue; }
      if (listBudget <= 0) { counts.custom_lists_skipped++; continue; }
      const { rows } = await client.query(
        `INSERT INTO custom_lists (name, icon, color, position, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [l.name, l.icon || 'list', l.color || 'violet', intOrNull(l.position) ?? 0, userId]
      );
      listIdByName.set(key, rows[0].id);
      oldToNewListId.set(l.id, rows[0].id);
      listBudget--;
      counts.custom_lists++;
    }
    for (const it of cap(payload.list_items)) {
      const listId = oldToNewListId.get(it.list_id);
      const title = typeof it.title === 'string' ? it.title.trim() : '';
      if (!listId || !title) continue;
      await client.query(
        `INSERT INTO list_items (list_id, title, notes, url, status, rating, position, linked_task_id, completed_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [listId, title, it.notes || null, it.url || null, oneOf(ITEM_STATUS, it.status, 'todo'),
         it.rating == null ? null : clamp(it.rating, 1, 5, null), intOrNull(it.position) ?? 0,
         it.linked_task_id != null ? oldToNewTaskId.get(it.linked_task_id) || null : null,
         tsOrNull(it.completed_at), userId]
      );
      counts.list_items++;
    }

    // Weekly-review history is plain stats — safe to append. Daily plans are
    // NOT imported: their payload references task ids from the old account.
    for (const w of cap(payload.weekly_reviews)) {
      await client.query(
        `INSERT INTO weekly_reviews (user_id, completed_at, inbox_count_at_start, tasks_completed, tasks_moved, tasks_deleted, ai_summary)
         VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6, $7)`,
        [userId, tsOrNull(w.completed_at), intOrNull(w.inbox_count_at_start) ?? 0, intOrNull(w.tasks_completed) ?? 0,
         intOrNull(w.tasks_moved) ?? 0, intOrNull(w.tasks_deleted) ?? 0, w.ai_summary || null]
      );
      counts.weekly_reviews++;
    }
  } else if (format === 'csv') {
    const seenProjects = new Set();
    for (const t of cap(payload.tasks)) {
      let project_id = null;
      if (t.project_name) {
        const r = await resolveProject(t.project_name, null);
        if (r) {
          project_id = r.id;
          const key = t.project_name.toLowerCase();
          if (!seenProjects.has(key)) {
            seenProjects.add(key);
            if (r.merged) counts.projects_merged++; else counts.projects_new++;
          }
        }
      }
      const id = await insertTaskRaw(client, { ...t, project_id }, userId);
      if (id != null) counts.tasks++;
    }
  } else {
    const err = new Error('Unknown format');
    err.status = 400;
    throw err;
  }
  return counts;
}

router.post('/commit', async (req, res) => {
  const { format, payload } = req.body || {};
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'No payload' });
  if (format !== 'gtdflow-json' && format !== 'csv') return res.status(400).json({ error: 'Unknown format' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await commitImport(client, req.user.id, format, payload);
    await client.query('COMMIT');
    res.json({ ok: true, counts });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Import commit failed (rolled back):', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to commit import — nothing was changed' });
  } finally {
    client.release();
  }
});

export default router;
