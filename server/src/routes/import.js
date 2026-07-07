import express from 'express';
import { pool } from '../db/pool.js';
import { ProjectModel } from '../db/models.js';
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

    const existingProjects = await ProjectModel.getAll(req.user.id);
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

async function insertTaskRaw(task, userId) {
  await pool.query(
    `INSERT INTO tasks (
      title, notes, list, context, project_id, waiting_for_person,
      due_date, start_date, scheduled_time, duration, energy_level, time_estimate,
      priority, is_daily_focus, position, recurrence_rule, recurrence_interval,
      recurrence_days, recurrence_type, completed_at, user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      task.title,
      task.notes || null,
      task.list || 'inbox',
      task.context || null,
      task.project_id || null,
      task.waiting_for_person || null,
      task.due_date || null,
      task.start_date || null,
      task.scheduled_time || null,
      task.duration || null,
      task.energy_level || null,
      task.time_estimate || null,
      task.priority || 0,
      !!task.is_daily_focus,
      task.position || 0,
      task.recurrence_rule || null,
      task.recurrence_interval || 1,
      task.recurrence_days || null,
      task.recurrence_type || 'absolute',
      task.completed_at || null,
      userId,
    ]
  );
}

router.post('/commit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { format, payload } = req.body || {};
    if (!payload) return res.status(400).json({ error: 'No payload' });

    const counts = { tasks: 0, projects_new: 0, projects_merged: 0, projects_skipped: 0, contexts: 0, habits: 0, habits_skipped: 0, habit_logs: 0 };

    // Free-tier caps apply to import too, or a hand-edited export JSON is a gate
    // bypass. Merges into existing projects/habits don't consume budget; only new
    // rows do. Over budget → skip and count, never partially fail the whole import.
    let projectBudget = await remainingAllowance(userId, 'projects');

    // Project resolver — case-insensitive match by name; create if missing and
    // there's budget. Returns null when it can't resolve or create (caller skips).
    const existingProjects = await ProjectModel.getAll(userId);
    const projectIdByName = new Map(existingProjects.map(p => [(p.name || '').toLowerCase(), p.id]));
    async function resolveProject(name, projectShape) {
      if (!name) return null;
      const key = name.toLowerCase();
      if (projectIdByName.has(key)) {
        return { id: projectIdByName.get(key), merged: true };
      }
      if (projectBudget <= 0) {
        counts.projects_skipped++;
        return null;
      }
      const created = await ProjectModel.create({
        name,
        description: projectShape?.description,
        outcome: projectShape?.outcome,
        execution_mode: projectShape?.execution_mode || 'parallel',
      }, userId);
      projectBudget--;
      projectIdByName.set(key, created.id);
      return { id: created.id, merged: false };
    }

    if (format === 'gtdflow-json') {
      // Map old project ids → new
      const oldToNewProjectId = new Map();
      for (const p of (payload.projects || [])) {
        const r = await resolveProject(p.name, p);
        if (!r) continue;
        if (r.merged) counts.projects_merged++; else counts.projects_new++;
        oldToNewProjectId.set(p.id, r.id);
      }

      // Contexts (skip if name already exists)
      const { rows: ctxRows } = await pool.query('SELECT name FROM contexts WHERE user_id = $1', [userId]);
      const existingCtx = new Set(ctxRows.map(r => r.name));
      for (const c of (payload.contexts || [])) {
        if (!c.name || existingCtx.has(c.name)) continue;
        await pool.query('INSERT INTO contexts (name, user_id) VALUES ($1, $2)', [c.name, userId]);
        counts.contexts++;
      }

      // Habits (merge by name; map old→new id for log import)
      const { rows: habitRows } = await pool.query('SELECT id, name FROM habits WHERE user_id = $1', [userId]);
      const habitIdByName = new Map(habitRows.map(r => [(r.name || '').toLowerCase(), r.id]));
      const oldToNewHabitId = new Map();
      let habitBudget = await remainingAllowance(userId, 'habits');
      for (const h of (payload.habits || [])) {
        const key = (h.name || '').toLowerCase();
        if (habitIdByName.has(key)) {
          oldToNewHabitId.set(h.id, habitIdByName.get(key));
          continue;
        }
        // The Free habits cap counts only active habits, so only an active import
        // consumes budget. Over budget → skip (its logs skip too, since the id map
        // won't have an entry).
        const willBeActive = !!(h.active ?? true);
        if (willBeActive && habitBudget <= 0) {
          counts.habits_skipped++;
          continue;
        }
        const { rows: insertRows } = await pool.query(
          `INSERT INTO habits (name, description, frequency, target_days, category, color, active, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [h.name, h.description || null, h.frequency || 'daily', h.target_days || null,
           h.category || null, h.color || '#3b82f6', willBeActive, userId]
        );
        const newId = insertRows[0].id;
        habitIdByName.set(key, newId);
        oldToNewHabitId.set(h.id, newId);
        if (willBeActive) habitBudget--;
        counts.habits++;
      }

      // Habit logs (use new habit id; ON CONFLICT DO NOTHING to skip dup dates)
      for (const log of (payload.habit_logs || [])) {
        const newHabitId = oldToNewHabitId.get(log.habit_id);
        if (!newHabitId || !log.completed_date) continue;
        await pool.query(
          `INSERT INTO habit_logs (habit_id, completed_date, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (habit_id, completed_date) DO NOTHING`,
          [newHabitId, log.completed_date, userId]
        );
        counts.habit_logs++;
      }

      // Tasks — append-only, map project ids
      for (const t of (payload.tasks || [])) {
        await insertTaskRaw({
          ...t,
          project_id: t.project_id ? oldToNewProjectId.get(t.project_id) : null,
        }, userId);
        counts.tasks++;
      }
    } else if (format === 'csv') {
      const seenProjects = new Set();
      for (const t of (payload.tasks || [])) {
        let project_id = null;
        if (t.project_name) {
          // resolveProject enforces the project cap and returns null when over
          // budget (or unresolvable) — the task then imports without a project.
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
        await insertTaskRaw({
          title: t.title,
          notes: t.notes,
          list: t.list,
          context: t.context,
          project_id,
          waiting_for_person: t.waiting_for_person,
          due_date: t.due_date,
          scheduled_time: t.scheduled_time,
          energy_level: t.energy_level,
          time_estimate: t.time_estimate,
          priority: t.priority,
          completed_at: t.completed_at,
          recurrence_rule: t.recurrence_rule,
          recurrence_interval: t.recurrence_interval,
          recurrence_days: t.recurrence_days,
        }, userId);
        counts.tasks++;
      }
    } else {
      return res.status(400).json({ error: 'Unknown format' });
    }

    res.json({ ok: true, counts });
  } catch (err) {
    console.error('Import commit failed:', err);
    res.status(500).json({ error: 'Failed to commit import' });
  }
});

export default router;
