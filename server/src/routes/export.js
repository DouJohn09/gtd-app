import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

async function getRows(table, userId) {
  // Table name comes from a hardcoded literal in callers, never from request input.
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
  return rows;
}

const TASK_FIELDS = [
  'id', 'title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person',
  'due_date', 'start_date', 'scheduled_time', 'duration', 'energy_level',
  'time_estimate', 'priority', 'is_daily_focus', 'completed_at', 'created_at',
  'updated_at', 'recurrence_rule', 'recurrence_interval', 'recurrence_days',
  'recurrence_type',
];
const PROJECT_FIELDS = ['id', 'name', 'description', 'status', 'outcome', 'execution_mode', 'created_at', 'updated_at'];
const CONTEXT_FIELDS = ['id', 'name', 'created_at'];
const HABIT_FIELDS = ['id', 'name', 'description', 'frequency', 'target_days', 'category', 'color', 'active', 'created_at'];
const HABIT_LOG_FIELDS = ['id', 'habit_id', 'completed_date', 'created_at'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined && obj[f] !== null) out[f] = obj[f];
  return out;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/json', async (req, res) => {
  try {
    const userId = req.user.id;
    const [tasksRaw, projectsRaw, contextsRaw, habitsRaw, habitLogsRaw] = await Promise.all([
      getRows('tasks', userId),
      getRows('projects', userId),
      getRows('contexts', userId),
      getRows('habits', userId),
      getRows('habit_logs', userId),
    ]);

    const tasks = tasksRaw.map(t => pick(t, TASK_FIELDS));
    const projects = projectsRaw.map(p => pick(p, PROJECT_FIELDS));
    const contexts = contextsRaw.map(c => pick(c, CONTEXT_FIELDS));
    const habits = habitsRaw.map(h => pick(h, HABIT_FIELDS));
    const habit_logs = habitLogsRaw.map(l => pick(l, HABIT_LOG_FIELDS));

    const payload = {
      app: 'Cleartable',
      version: 1,
      exported_at: new Date().toISOString(),
      counts: {
        tasks: tasks.length,
        projects: projects.length,
        contexts: contexts.length,
        habits: habits.length,
        habit_logs: habit_logs.length,
      },
      tasks, projects, contexts, habits, habit_logs,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cleartable-export-${todayStamp()}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Export JSON failed:', err);
    res.status(500).json({ error: 'Failed to export' });
  }
});

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Our priority (4 highest, 0 none) → Todoist priority (1 highest, 4 none)
function mapPriority(p) {
  if (!p || p <= 1) return 4;
  if (p === 2) return 3;
  if (p === 3) return 2;
  return 1;
}

const CSV_HEADERS = [
  'TYPE', 'CONTENT', 'DESCRIPTION', 'PRIORITY', 'INDENT', 'AUTHOR', 'RESPONSIBLE',
  'DATE', 'DATE_LANG', 'TIMEZONE',
  'LIST', 'CONTEXT', 'PROJECT', 'ENERGY', 'TIME_ESTIMATE', 'WAITING_FOR',
  'COMPLETED', 'COMPLETED_AT', 'RECURRENCE',
];

router.get('/csv', async (req, res) => {
  try {
    const userId = req.user.id;
    const [projects, tasks] = await Promise.all([
      getRows('projects', userId),
      getRows('tasks', userId),
    ]);
    const projectName = new Map(projects.map(p => [p.id, p.name]));

    const lines = [CSV_HEADERS.join(',')];

    for (const t of tasks) {
      const date = t.scheduled_time && t.due_date
        ? `${t.due_date} ${t.scheduled_time}`
        : (t.due_date || '');

      let recurrence = '';
      if (t.recurrence_rule) {
        recurrence = t.recurrence_rule;
        if (t.recurrence_interval && t.recurrence_interval > 1) recurrence += `/${t.recurrence_interval}`;
        if (t.recurrence_days) recurrence += `:${t.recurrence_days}`;
      }

      const row = [
        'task',
        t.title || '',
        (t.notes || '').replace(/\r?\n/g, '\\n'),
        mapPriority(t.priority),
        1,
        '',
        '',
        date,
        date ? 'en' : '',
        '',
        t.list || '',
        t.context || '',
        projectName.get(t.project_id) || '',
        t.energy_level || '',
        t.time_estimate || '',
        t.waiting_for_person || '',
        t.list === 'completed' ? 'true' : 'false',
        t.completed_at || '',
        recurrence,
      ];
      lines.push(row.map(csvEscape).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cleartable-export-${todayStamp()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('Export CSV failed:', err);
    res.status(500).json({ error: 'Failed to export' });
  }
});

export default router;
