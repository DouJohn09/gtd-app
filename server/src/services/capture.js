// Smart Capture: free text in, one or more sorted tasks out. Shared by the
// app's capture box (POST /api/ai/smart-capture) and the MCP capture tool.
import { TaskModel, ProjectModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { smartCapture } from './ai.js';
import { syncTaskToCalendar } from './googleCalendar.js';
import { findFreeSlot } from './scheduling.js';
import { check, charge } from './aiUsage.js';
import { getAiMode } from './userPrefs.js';
import { resolveRelativeDate } from '../lib/relativeDate.js';

export const MAX_CAPTURE_CHARS = 2_000;   // a captured thought, not a document

export async function getUserContexts(userId) {
  const { rows } = await pool.query(
    'SELECT name FROM contexts WHERE user_id = $1 ORDER BY name',
    [userId]
  );
  return rows;
}

// Few-shot examples: the user's recent classified tasks. Drives the AI toward
// the user's actual naming pattern (e.g. "call mom" → Personal, not Phone).
// Ordered by updated_at so user CORRECTIONS (moving a task between lists,
// fixing its context) surface in the next capture's prompt — the AI learns
// from edits, not just initial classifications.
export async function getRecentClassifiedTasks(userId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT title, context, list, project_id
     FROM tasks
     WHERE user_id = $1
       AND context IS NOT NULL
       AND context != ''
       AND list != 'inbox'
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

// Recent open tasks, injected into Smart Capture so it can flag "possible
// duplicate of ..." at capture time instead of after the fact.
async function getOpenTaskTitles(userId, limit = 15) {
  const { rows } = await pool.query(
    `SELECT title FROM tasks
     WHERE user_id = $1 AND list IN ('inbox', 'next_actions')
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map(r => r.title);
}

// One task from one smart-capture item. `source` is the text it came from
// (the whole capture, or its own slice after a split; null if the model
// didn't say), used for the relative-date check and the notes.
async function createCapturedTask(ctx, ai, { source, projects, aiMode }) {
  if (source && !ai.recurrence_rule) {
    const resolved = resolveRelativeDate(source, ctx.today);
    if (resolved) ai.due_date = resolved;
  }
  const urls = source?.match(/https?:\/\/[^\s]+/gi) || [];
  // Confidence-gated routing: trust AI's list when confident, fall back to
  // inbox when ambiguous (or always, in assisted mode). All other AI parsing
  // (context, due date, project, etc.) is preserved regardless — the inbox
  // becomes a triage holding bay with metadata pre-filled, not a re-do from
  // scratch.
  let routedToInbox = false;
  if (aiMode === 'assisted' && ai.list !== 'inbox') {
    ai.list = 'inbox';
    routedToInbox = true;
  } else if (aiMode !== 'assisted' && ai.list_confidence === 'low' && ai.list !== 'inbox') {
    ai.list = 'inbox';
    routedToInbox = true;
  }

  // Resolve project_id from AI's project_name suggestion: exact, then whole-word
  // containment either direction. The pad-with-spaces trick keeps a short project
  // name ("AI", "Tax") from matching any phrase that merely contains those letters
  // ("mAIntain the garden") — the old bare substring match silently misfiled tasks.
  let projectId = null;
  if (ai.project_name) {
    const norm = s => ` ${s.toLowerCase().trim().replace(/\s+/g, ' ')} `;
    const aiName = norm(ai.project_name);
    const match = projects.find(p => norm(p.name) === aiName)
      || projects.find(p => { const n = norm(p.name); return aiName.includes(n) || n.includes(aiName); });
    if (match) projectId = match.id;
    else console.warn(`Smart capture: AI suggested project "${ai.project_name}" but no match found. Available: ${projects.map(p => p.name).join(', ')}`);
  }

  // Preserve the raw transcript in notes when the input is detailed enough
  // that title compression is likely lossy. Short captures ("buy milk") would
  // just duplicate the title, so skip those. URLs are already inside the source
  // when it's long, so only fall back to a URL-only notes value for shorts.
  const rawWordCount = (source || '').split(/\s+/).filter(Boolean).length;
  let notes = null;
  if (rawWordCount > 8 || (source || '').length > 60) notes = source;
  else if (urls.length) notes = urls.join('\n');

  // AI-assisted scheduling: find a free slot if requested
  let bookedSlot = null;
  let slotSearchFailed = false;
  if (ai.find_free_slot && ai.due_date && !ai.scheduled_time) {
    const duration = ai.duration || 30;
    try {
      const slot = await findFreeSlot(ctx.userId, ai.due_date, duration, ctx.timezone);
      if (slot) {
        ai.scheduled_time = slot;
        ai.duration = duration;
        bookedSlot = { date: ai.due_date, time: slot, duration };
      } else {
        slotSearchFailed = true;
      }
    } catch (err) {
      console.error('findFreeSlot error:', err);
      slotSearchFailed = true;
    }
  }

  const taskData = {
    title: ai.title || source,
    notes,
    list: ai.list || 'inbox',
    context: ai.context || null,
    project_id: projectId,
    priority: ai.priority || 3,
    energy_level: ai.energy_level || 'medium',
    time_estimate: ai.time_estimate_minutes || null,
    due_date: ai.due_date || null,
    start_date: ai.start_date || null,
    scheduled_time: ai.scheduled_time || null,
    duration: ai.duration || null,
    is_daily_focus: !!ai.is_daily_focus,
    waiting_for_person: ai.waiting_for_person || null,
    recurrence_rule: ai.recurrence_rule || null,
    recurrence_interval: ai.recurrence_interval || null,
    recurrence_days: ai.recurrence_days || null,
  };
  const task = await TaskModel.create(taskData, ctx.userId);
  return { task, ai, bookedSlot, slotSearchFailed, routedToInbox };
}

// Runs one capture for ctx = { userId, today, timezone }. `results` holds one
// entry per created task; with no AI (off, over budget, provider down) it is
// the raw text as a single inbox task with `ai: null`.
export async function captureText(ctx, rawText) {
  const urls = rawText.match(/https?:\/\/[^\s]+/gi) || [];
  // The user's ai_mode (not a client param) decides whether AI runs and how
  // aggressively it routes — a stale client can't re-enable AI for a user
  // who turned it off.
  const aiMode = await getAiMode(ctx.userId);
  const [contexts, allProjects, history, openTitles] = await Promise.all([
    getUserContexts(ctx.userId),
    ProjectModel.getAll(ctx.userId),
    getRecentClassifiedTasks(ctx.userId, 10),
    getOpenTaskTitles(ctx.userId, 15),
  ]);
  const projects = allProjects.filter(p => p.status === 'active');
  const today = ctx.today;
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: ctx.timezone || 'UTC' });
  // Soft throttle: when the user is over their daily AI budget, skip the
  // OpenAI call entirely and fall back to raw capture rather than hard-blocking.
  // The task still lands in the inbox as plain text — just without enrichment.
  let ai = null;
  let throttled = false;
  if (aiMode !== 'off') {
    const budget = await check(ctx.userId, ctx.today);
    throttled = !budget.allowed;
    if (budget.allowed) {
      ai = await smartCapture(rawText, contexts, projects, today, dayName, history, openTitles);
      // No provider configured → same graceful raw-capture fallback as the
      // budget path, not an error. The capture must never fail.
      if (ai?.error) ai = null;
      // Charge only for enrichment we actually delivered — a throttle or a
      // provider failure (raw-capture fallback) doesn't consume budget.
      if (ai) await charge(ctx.userId, 1, ctx.today);
    }
  }

  if (!ai) {
    const taskData = { title: rawText };
    if (urls.length) taskData.notes = urls.join('\n');
    const task = await TaskModel.create(taskData, ctx.userId);
    return { aiMode, throttled, results: [{ task, ai: null }] };
  }

  // One capture can name several separate actions ("call the dentist, and
  // finish the Q4 deck"); each becomes its own task. With a split, dates and
  // notes come from that task's own slice of the text, so a "Friday" said
  // about one can't land on another.
  const multi = ai.tasks.length > 1;
  const results = [];
  for (const item of ai.tasks) {
    const source = multi ? (item.source_text?.trim() || null) : rawText;
    results.push(await createCapturedTask(ctx, item, { source, projects, aiMode }));
  }
  for (const r of results) {
    syncTaskToCalendar(ctx.userId, r.task, ctx.timezone).catch(err => console.error('syncTaskToCalendar (capture):', err));
  }
  return { aiMode, throttled, results };
}
