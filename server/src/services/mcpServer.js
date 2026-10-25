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
  if (t.duration) out.duration_minutes = t.duration;
  if (t.waiting_for_person) out.waiting_for = t.waiting_for_person;
  if (t.priority) out.priority = t.priority;
  if (t.is_daily_focus) out.focus_today = true;
  if (t.recurrence_rule) out.repeats = t.recurrence_rule;
  if (t.notes) out.notes = t.notes.length > 300 ? t.notes.slice(0, 300) + '…' : t.notes;
  return out;
}

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }], structuredContent: data });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function findProject(userId, name) {
  if (!name) return null;
  const projects = (await ProjectModel.getAll(userId)).filter(p => p.status === 'active');
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
  duration_minutes: z.number().int().min(5).max(720).optional(),
  context: z.string().max(40).optional().describe('Where/how, e.g. @home, @work, @phone, @computer, @errands'),
  project: z.string().max(200).optional().describe('Name of an existing project (see list_projects)'),
  waiting_for: z.string().max(200).optional().describe('Who it is waiting on (for list waiting_for)'),
  priority: z.number().int().min(1).max(5).optional().describe('1 = low … 5 = urgent'),
};

async function toTaskData(userId, a) {
  const data = {};
  for (const k of ['notes', 'list', 'due_date', 'deadline', 'context', 'priority']) if (a[k] !== undefined) data[k] = a[k];
  if (a.time !== undefined) data.scheduled_time = a.time;
  if (a.duration_minutes !== undefined) data.duration = a.duration_minutes;
  if (a.waiting_for !== undefined) data.waiting_for_person = a.waiting_for;
  if (a.project !== undefined) {
    const p = await findProject(userId, a.project);
    if (!p) return { error: `No active project named "${a.project}". Use list_projects to see them.` };
    data.project_id = p.id;
  }
  return { data };
}

export async function userClock(userId) {
  const { rows } = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
  const tz = isValidTimezone(rows[0]?.timezone) ? rows[0].timezone : undefined;
  return { timezone: tz, today: todayInTz(tz) };
}

export function buildMcpServer({ userId, timezone, today }) {
  const server = new McpServer(
    { name: 'cleartable', title: 'Cleartable', version: '1.0.0', websiteUrl: 'https://cleartable.app' },
    { instructions: `Cleartable is the user's task manager (tasks, projects, habits, calendar). Today is ${today}${timezone ? ` (${timezone})` : ''}. When the user wants to remember, add or plan something, use capture_tasks with their own words: Cleartable splits it into tasks and files each one. Use add_task only when you already know the exact fields.` }
  );

  server.registerTool('capture_tasks', {
    title: 'Capture tasks',
    description: 'Add one or more tasks from plain language, the way the user said it ("call the dentist tomorrow, and remind me to send Anna the budget on Friday"). Cleartable\'s AI splits it into separate tasks and sorts each one: list, due date, context, project, calendar time. Best default for adding anything.',
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
    return json({ created: tasks.length, tasks, ...(note && { note }) });
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
    return json({ task: slim(task) });
  });

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Read the user\'s open tasks. view: today (due today, overdue, or picked as focus), inbox, next_actions, waiting_for, someday_maybe, upcoming (next 14 days), completed (recent). Or search titles and notes with query.',
    inputSchema: {
      view: z.enum(['today', 'upcoming', ...LISTS, 'completed']).optional().describe('Default: today'),
      query: z.string().max(100).optional().describe('Search text; searches all open tasks, ignores view'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ view = 'today', query, limit = 50 }) => {
    let tasks;
    if (query) {
      const { rows } = await pool.query(
        `SELECT t.*, p.name AS project_name FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
         WHERE t.user_id = $1 AND t.list != 'completed' AND (t.title ILIKE $2 OR t.notes ILIKE $2)
         ORDER BY t.updated_at DESC LIMIT $3`,
        [userId, `%${query.replace(/[\\%_]/g, '\\$&')}%`, limit]
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
    return json({ view: query ? 'search' : view, count: tasks.length, tasks: tasks.slice(0, limit).map(slim) });
  });

  server.registerTool('update_task', {
    title: 'Update a task',
    description: 'Change a task: rename, reschedule, move to another list or project, add notes. Only the given fields change. Get the id from list_tasks.',
    inputSchema: { task_id: z.number().int(), title: z.string().min(1).max(500).optional(), ...taskFields },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ task_id, title, ...rest }) => {
    const { data, error } = await toTaskData(userId, rest);
    if (error) return fail(error);
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
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const projects = (await ProjectModel.getAll(userId)).filter(p => p.status === 'active');
    return json({ projects: projects.map(p => ({ id: p.id, name: p.name, open_tasks: p.task_count ?? undefined })) });
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
