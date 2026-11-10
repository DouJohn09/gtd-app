// The MCP tools an AI app (Claude, ChatGPT, Grok) gets once the user connects
// Cleartable. One server instance per request, bound to the signed-in user.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { pool } from '../db/pool.js';
import { TaskModel, ProjectModel } from '../db/models.js';
import { captureText, MAX_CAPTURE_CHARS } from './capture.js';
import { syncTaskToCalendar, getCalendarEvents } from './googleCalendar.js';
import { isDueOn } from '../routes/habits.js';
import { todayInTz, isValidTimezone } from '../lib/dateTime.js';
import { withCapacity, LimitError } from './billing.js';

const LISTS = ['inbox', 'next_actions', 'waiting_for', 'someday_maybe'];
const LIST_NAMES = { inbox: 'Inbox', next_actions: 'Next Actions', waiting_for: 'Waiting For', someday_maybe: 'Someday/Maybe', completed: 'Completed' };
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour');

// What the AI sees of a task: enough to talk about it and act on it.
function slim(t) {
  const out = { id: t.id, title: t.title, list: LIST_NAMES[t.list] || t.list };
  if (t.project_name) out.project = t.project_name;
  if (t.context) out.context = t.context;
  if (t.due_date) out.due_date = String(t.due_date).slice(0, 10);
  if (t.deadline) out.deadline = String(t.deadline).slice(0, 10);
  if (t.scheduled_time) out.time = t.scheduled_time;
  if (t.start_date) out.start_date = String(t.start_date).slice(0, 10);
  if (t.duration) out.duration_minutes = t.duration;
  if (t.time_estimate) out.estimate_minutes = t.time_estimate;
  if (t.energy_level) out.energy = t.energy_level;
  if (t.waiting_for_person) out.waiting_for = t.waiting_for_person;
  if (t.priority) out.priority = t.priority;
  if (t.is_daily_focus) out.focus_today = true;
  if (t.recurrence_rule) {
    out.repeats = t.recurrence_rule;
    if (t.recurrence_interval > 1) out.repeat_every = t.recurrence_interval;
    if (t.recurrence_days) out.repeat_days = t.recurrence_days.split(',');
    if (t.recurrence_type === 'relative') out.repeat_from = 'completion';
  }
  if (t.notes) out.notes = t.notes.length > 300 ? t.notes.slice(0, 300) + '…' : t.notes;
  return out;
}

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: data });
// Sent with every answer that adds or shows tasks. People who connect an AI
// app often never open Cleartable itself, so the assistant gets a link and a
// line it can pass on.
const APP_URL = 'https://cleartable.app/app';
const inApp = { open_in_cleartable: APP_URL, tip_for_user: `These tasks are in the user's Cleartable app too, where they can see them at a glance, tick them off on their phone and plan them into their calendar: ${APP_URL}` };
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function findProject(userId, name, { anyStatus = false } = {}) {
  if (!name) return null;
  const projects = (await ProjectModel.getAll(userId)).filter(p => anyStatus || p.status === 'active');
  const n = name.toLowerCase().trim();
  return projects.find(p => p.name.toLowerCase() === n)
    || projects.find(p => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()))
    || null;
}

// Fields shared by add_task and update_task.
const taskFields = {
  notes: z.string().max(5000).optional().describe('Longer details, links'),
  list: z.enum(LISTS).optional().describe('inbox = unsorted; next_actions = to do; waiting_for = someone else owes it; someday_maybe = not now'),
  due_date: DATE.optional().describe('Due date, YYYY-MM-DD: the day it is planned for'),
  deadline: DATE.optional().describe('Hard "by" date, YYYY-MM-DD, when it differs from the due date ("by Friday")'),
  time: TIME.optional().describe('Start time on the due date, HH:MM 24-hour. Puts it on the calendar.'),
  start_date: DATE.optional().describe('Hide the task until this date, YYYY-MM-DD'),
  duration_minutes: z.number().int().min(5).max(720).optional().describe('Length of its calendar block, in minutes'),
  estimate_minutes: z.number().int().min(1).max(1440).optional().describe('Rough estimate of the work, in minutes'),
  energy: z.enum(['low', 'medium', 'high']).optional().describe('How demanding the task is: also use this for difficulty or complexity'),
  context: z.string().max(40).optional().describe('Where/how, one of the user\'s contexts, usually @home, @work, @phone, @computer, @errands, @anywhere'),
  project: z.string().max(200).optional().describe('Name of an existing project (see list_projects, or create_project for a new one)'),
  waiting_for: z.string().max(200).optional().describe('Who it is waiting on (for list waiting_for)'),
  priority: z.number().int().min(1).max(5).optional().describe('1 = low … 5 = urgent'),
  focus_today: z.boolean().optional().describe('true pins it to today\'s focus list, false unpins it'),
  repeat: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom']).optional().describe('Makes it a repeating task. custom with repeat_every = every N days'),
  repeat_every: z.number().int().min(1).max(365).optional().describe('Interval: 2 with weekly = every 2 weeks'),
  repeat_days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1).max(7).optional().describe('Repeat on these weekdays'),
  repeat_from: z.enum(['schedule', 'completion']).optional().describe('Next date counts from the schedule (default) or from when it was completed'),
};

// Input field to task column, where the value is stored as given.
const COLUMNS = {
  notes: 'notes', list: 'list', due_date: 'due_date', deadline: 'deadline', start_date: 'start_date',
  time: 'scheduled_time', duration_minutes: 'duration', estimate_minutes: 'time_estimate', energy: 'energy_level',
  waiting_for: 'waiting_for_person', priority: 'priority', focus_today: 'is_daily_focus',
  repeat: 'recurrence_rule', repeat_every: 'recurrence_interval',
};
// What update_task's clear option can empty, and the columns that holds.
const CLEARABLE = {
  notes: ['notes'], due_date: ['due_date'], deadline: ['deadline'], start_date: ['start_date'], time: ['scheduled_time'],
  duration_minutes: ['duration'], estimate_minutes: ['time_estimate'], energy: ['energy_level'], context: ['context'],
  project: ['project_id'], waiting_for: ['waiting_for_person'], priority: ['priority'],
  repeat: ['recurrence_rule', 'recurrence_interval', 'recurrence_days', 'recurrence_type'],
};

// Contexts are the user's own list, and the app only filters by those names.
async function findContext(userId, name) {
  const { rows } = await pool.query('SELECT name FROM contexts WHERE user_id = $1 ORDER BY name', [userId]);
  const key = (s) => s.toLowerCase().replace(/^@/, '').trim();
  return { match: rows.find(r => key(r.name) === key(name))?.name, available: rows.map(r => r.name) };
}

async function toTaskData(userId, a) {
  const data = {};
  for (const [field, column] of Object.entries(COLUMNS)) if (a[field] !== undefined) data[column] = a[field];
  // Named weekdays only work with the custom rule, whatever rule came with them.
  if (a.repeat_days !== undefined) {
    data.recurrence_rule = 'custom';
    data.recurrence_days = a.repeat_days.join(',');
  }
  if (a.repeat_from !== undefined) data.recurrence_type = a.repeat_from === 'completion' ? 'relative' : 'absolute';
  if (a.context !== undefined) {
    const { match, available } = await findContext(userId, a.context);
    if (!match && available.length) return { error: `No context named "${a.context}". Available: ${available.join(', ')}.` };
    data.context = match || a.context;
  }
  if (a.project !== undefined) {
    const p = await findProject(userId, a.project);
    if (!p) return { error: `No active project named "${a.project}". Use list_projects to see them, or create_project to make it.` };
    data.project_id = p.id;
  }
  return { data };
}

export async function userClock(userId) {
  const { rows } = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
  const tz = isValidTimezone(rows[0]?.timezone) ? rows[0].timezone : undefined;
  return { timezone: tz, today: todayInTz(tz) };
}

// onTool(name, ok) is told how each tool call ended, for the mcp_calls log.
export function buildMcpServer({ userId, timezone, today, onTool }) {
  const server = new McpServer(
    { name: 'cleartable', title: 'Cleartable', version: '1.0.0', websiteUrl: 'https://cleartable.app' },
    { instructions: `Cleartable is the user's task manager (tasks, projects, habits, calendar). Today is ${today}${timezone ? ` (${timezone})` : ''}. When the user wants to remember, add or plan something, use capture_tasks with their own words: Cleartable splits it into tasks and files each one. For a list of more than 8 items, call capture_tasks several times with up to 8 items each. Use add_task only when you already know the exact fields. Use create_project for a new project, then add tasks to it by name. After adding tasks, mention once that the user can see and plan them in the Cleartable app (${APP_URL}).` }
  );

  if (onTool) {
    const register = server.registerTool.bind(server);
    server.registerTool = (name, config, handler) => register(name, config, async (...args) => {
      try {
        const result = await handler(...args);
        onTool(name, !result?.isError);
        return result;
      } catch (err) {
        onTool(name, false);
        throw err;
      }
    });
  }

  server.registerTool('capture_tasks', {
    title: 'Capture tasks',
    description: 'Add one or more tasks from plain language, the way the user said it ("call the dentist tomorrow, and remind me to send Anna the budget on Friday"). Cleartable\'s AI splits it into separate tasks and sorts each one: list, due date, context, project, calendar time. Best default for adding anything. One call sorts at most 8 tasks, so split a longer list into several calls of up to 8 items each.',
    inputSchema: { text: z.string().min(1).max(MAX_CAPTURE_CHARS).describe('What to capture, in natural language') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ text }) => {
    const { aiMode, throttled, results } = await captureText({ userId, today, timezone }, text.trim());
    const tasks = results.map(r => slim(r.task));
    const note = !results[0].ai
      ? (aiMode === 'off' ? 'AI sorting is off for this user, so it was saved as one Inbox task.'
        : throttled ? 'Daily AI limit reached, so it was saved as one Inbox task without sorting.'
        : 'AI sorting was unavailable, so it was saved as one Inbox task.')
      : undefined;
    return json({ created: tasks.length, tasks, ...(note && { note }), ...inApp });
  });

  server.registerTool('add_task', {
    title: 'Add a task',
    description: 'Add a single task with exact fields, no AI sorting. Lands in the Inbox unless a list is given.',
    inputSchema: { title: z.string().min(1).max(500), ...taskFields },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (a) => {
    const { data, error } = await toTaskData(userId, a);
    if (error) return fail(error);
    const task = await TaskModel.create({ title: a.title.trim(), ...data }, userId);
    syncTaskToCalendar(userId, task, timezone).catch(err => console.error('syncTaskToCalendar (mcp add):', err));
    return json({ task: slim(task), ...inApp });
  });

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Read the user\'s open tasks. view: today (due today, overdue, or picked as focus), inbox, next_actions, waiting_for, someday_maybe, upcoming (next 14 days), completed (recent). Or search titles and notes with query, or get one project\'s tasks with project.',
    inputSchema: {
      view: z.enum(['today', 'upcoming', ...LISTS, 'completed']).optional().describe('Default: today'),
      query: z.string().max(100).optional().describe('Search text; searches all open tasks, ignores view'),
      project: z.string().max(200).optional().describe('Only this project\'s open tasks, in project order. Ignores view, except completed shows its finished tasks'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ view = 'today', query, project, limit = 50 }) => {
    let tasks;
    let inProject = null;
    if (project) {
      inProject = await findProject(userId, project, { anyStatus: true });
      if (!inProject) return fail(`No project named "${project}". Use list_projects to see them.`);
    }
    if (query || inProject) {
      const params = [userId, limit];
      const where = [view === 'completed' && inProject ? `t.list = 'completed'` : `t.list != 'completed'`];
      if (query) {
        params.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`(t.title ILIKE $${params.length} OR t.notes ILIKE $${params.length})`);
      }
      if (inProject) {
        params.push(inProject.id);
        where.push(`t.project_id = $${params.length}`);
      }
      const { rows } = await pool.query(
        `SELECT t.*, p.name AS project_name FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
         WHERE t.user_id = $1 AND ${where.join(' AND ')}
         ORDER BY ${inProject ? 't.position ASC, t.created_at ASC' : 't.updated_at DESC'} LIMIT $2`,
        params
      );
      tasks = rows;
    } else if (view === 'today') {
      tasks = await TaskModel.getDailyFocus(userId, today);
    } else if (view === 'upcoming') {
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 14);
      tasks = await TaskModel.getByDateRange(today, end.toISOString().slice(0, 10), userId);
    } else {
      tasks = await TaskModel.getAll(view, userId, today);
    }
    return json({ view: query ? 'search' : inProject ? 'project' : view, ...(inProject && { project: inProject.name }), count: tasks.length, tasks: tasks.slice(0, limit).map(slim), ...inApp });
  });

  server.registerTool('update_task', {
    title: 'Update a task',
    description: 'Change a task: rename, reschedule, move to another list or project, set estimate, energy, context, priority or repeat, add notes. Only the given fields change; use clear to empty one. Get the id from list_tasks.',
    inputSchema: {
      task_id: z.number().int(),
      title: z.string().min(1).max(500).optional(),
      ...taskFields,
      clear: z.array(z.enum(Object.keys(CLEARABLE))).optional().describe('Fields to empty, e.g. ["due_date"] to remove the date or ["repeat"] to stop repeating'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ task_id, title, clear = [], ...rest }) => {
    const { data, error } = await toTaskData(userId, rest);
    if (error) return fail(error);
    for (const column of clear.flatMap(f => CLEARABLE[f])) if (data[column] === undefined) data[column] = null;
    if (title) data.title = title.trim();
    if (!Object.keys(data).length) return fail('Nothing to change: give at least one field.');
    const task = await TaskModel.update(task_id, data, userId);
    if (!task) return fail(`No task with id ${task_id}.`);
    syncTaskToCalendar(userId, task, timezone).catch(err => console.error('syncTaskToCalendar (mcp update):', err));
    return json({ task: slim(task) });
  });

  server.registerTool('complete_task', {
    title: 'Complete a task',
    description: 'Mark a task done. A repeating task moves to its next date instead.',
    inputSchema: { task_id: z.number().int() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ task_id }) => {
    const task = await TaskModel.complete(task_id, userId, today);
    if (!task) return fail(`No task with id ${task_id}.`);
    if (task.list !== 'completed' && task.scheduled_time) {
      syncTaskToCalendar(userId, task, timezone).catch(err => console.error('syncTaskToCalendar (mcp complete):', err));
    }
    return json(task.list === 'completed'
      ? { done: true, task: slim(task) }
      : { done: true, repeats: true, next: slim(task) });
  });

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'The user\'s active projects, with how many open tasks each has.',
    inputSchema: { include_inactive: z.boolean().optional().describe('Also list completed and on-hold projects') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ include_inactive }) => {
    const projects = (await ProjectModel.getAll(userId)).filter(p => include_inactive || p.status === 'active');
    return json({ projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      ...(p.outcome && { outcome: p.outcome }),
      ...(p.execution_mode === 'sequential' && { execution: 'sequential' }),
      open_tasks: p.task_count ?? undefined,
    })) });
  });

  server.registerTool('create_project', {
    title: 'Create a project',
    description: 'Create a new project: an outcome that takes several tasks. If an active project with this exact name exists, it is returned instead of making a duplicate. Add tasks with add_task using the project name.',
    inputSchema: {
      name: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional().describe('Background and details'),
      outcome: z.string().max(500).optional().describe('What done looks like'),
      execution: z.enum(['parallel', 'sequential']).optional().describe('sequential = tasks are done one at a time, in order. Default: parallel'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ name, description, outcome, execution }) => {
    let outcomeOfCreate;
    try {
      // Duplicate check and limit check share the lock, so parallel calls can
      // neither pass the plan's cap nor create the same project twice.
      outcomeOfCreate = await withCapacity(userId, 'projects', async (db, assertRoom) => {
        const { rows } = await db.query(
          `SELECT id, name FROM projects WHERE user_id = $1 AND status = 'active' AND LOWER(TRIM(name)) = LOWER($2) LIMIT 1`,
          [userId, name]
        );
        if (rows[0]) return { project: rows[0], created: false };
        await assertRoom();
        const id = await ProjectModel.insert({ name, description, outcome, execution_mode: execution }, userId, db);
        return { project: { id, name }, created: true };
      });
    } catch (err) {
      if (err instanceof LimitError) return fail(err.message);
      throw err;
    }
    const { project, created } = outcomeOfCreate;
    return json({ created, ...(!created && { already_existed: true }), project: { id: project.id, name: project.name }, open_in_cleartable: APP_URL });
  });

  server.registerTool('update_project', {
    title: 'Update a project',
    description: 'Rename a project, change its description, outcome or task order, or set its status. Only the given fields change. Completing a project does not complete its tasks. Get the id from list_projects.',
    inputSchema: {
      project_id: z.number().int(),
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(5000).optional().describe('Empty string removes it'),
      outcome: z.string().max(500).optional().describe('Empty string removes it'),
      execution: z.enum(['parallel', 'sequential']).optional(),
      status: z.enum(['active', 'on_hold', 'completed']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ project_id, name, description, outcome, execution, status }) => {
    const updates = { name, description, outcome, execution_mode: execution, status };
    if (Object.values(updates).every(v => v === undefined)) return fail('Nothing to change: give at least one field.');
    if (name) {
      const projects = await ProjectModel.getAll(userId);
      const taken = projects.find(p => p.id !== project_id && p.status === 'active' && p.name.toLowerCase().trim() === name.toLowerCase());
      if (taken) return fail(`There is already an active project named "${taken.name}".`);
    }
    const project = await ProjectModel.update(project_id, updates, userId);
    if (!project) return fail(`No project with id ${project_id}.`);
    return json({
      project: { id: project.id, name: project.name, status: project.status, ...(project.outcome && { outcome: project.outcome }), execution: project.execution_mode },
      open_tasks: project.tasks.filter(t => t.list !== 'completed').length,
      open_in_cleartable: APP_URL,
    });
  });

  server.registerTool('get_today', {
    title: 'Today overview',
    description: 'Everything on the user\'s plate today: tasks due or picked for today, calendar events, and habits due today with whether they are done.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const [tasks, events, { rows: habits }, { rows: logs }] = await Promise.all([
      TaskModel.getDailyFocus(userId, today),
      getCalendarEvents(userId, today, today, timezone).catch(() => []),
      pool.query('SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY name', [userId]),
      pool.query('SELECT habit_id, status FROM habit_logs WHERE user_id = $1 AND completed_date = $2', [userId, today]),
    ]);
    const status = new Map(logs.map(l => [l.habit_id, l.status]));
    const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone || 'UTC' }) : null;
    return json({
      ...inApp,
      date: today,
      tasks: tasks.map(slim),
      events: events.filter(e => e.due_date === today).map(e => ({
        title: e.title, all_day: e.all_day || undefined, start: fmtTime(e.start_time) ?? undefined, end: fmtTime(e.end_time) ?? undefined,
      })),
      habits: habits
        .filter(h => h.frequency === 'weekly' || isDueOn(h, today))
        .map(h => ({
          name: h.name,
          ...(h.type === 'quit' && { kind: 'quit' }),
          ...((h.preferred_time || h.time_of_day) && { when: h.preferred_time || h.time_of_day }),
          ...(h.duration && { duration_minutes: h.duration }),
          status: status.get(h.id) || 'not yet',
        })),
    });
  });

  return server;
}
