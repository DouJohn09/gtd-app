import { Router } from 'express';
import { TaskModel, ProjectModel, WeeklyReviewModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { processInbox, getDailyPriorities, importNotes, findDuplicates, weeklyReviewAnalysis, planDay, planWeek, AI_INPUT_CAPS } from '../services/ai.js';
import { syncTaskToCalendar } from '../services/googleCalendar.js';
import { findFreeSlot, freeRangesFor, timeToMinutes, minutesToTime, eventMinutesOnDay, clampRangesToNow, packPlan, freeRangesFrom } from '../services/scheduling.js';
import { getStatus } from '../services/aiUsage.js';
import { enforceAiLimit, requireAiEnabled, chargeAiUsage } from '../middleware/aiLimit.js';
import { getAiMode } from '../services/userPrefs.js';
import { assertPlanWithinLimit, assertWeekPlanWithinLimit, LimitError } from '../services/billing.js';
import { recordAppliedBlocks, closeBlock, planReality, planningProfileText, calibrationLine } from '../services/insights.js';
import { serverError } from '../lib/httpErrors.js';
import { summarizeHabits } from './habits.js';
import { captureText, getUserContexts, getRecentClassifiedTasks, MAX_CAPTURE_CHARS } from '../services/capture.js';

// Unified AI error contract: 503 = no provider configured, 502 = providers
// tried and failed. Returns true when the response has been sent.
function aiFailed(res, result) {
  if (result?.error) {
    res.status(503).json({ error: 'AI is not configured on this server' });
    return true;
  }
  if (!result) {
    res.status(502).json({ error: 'AI processing failed' });
    return true;
  }
  return false;
}

const router = Router();

// Free-text inputs are bounded before any provider call. The body limit alone
// (1 MB) would let one paste fall through Groq's context window onto the paid
// OpenAI fallback at ~225k tokens, and a failed call is never charged, so an
// unbounded input is a free, repeatable cost amplifier.
const MAX_NOTES_CHARS = 20_000;    // import-notes: a long meeting note / brain dump

router.post('/smart-capture', async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    if (text.length > MAX_CAPTURE_CHARS) {
      return res.status(413).json({
        error: 'text_too_long',
        message: `Keep a capture under ${MAX_CAPTURE_CHARS.toLocaleString()} characters — for longer text use Import notes.`,
      });
    }
    const ctx = { userId: req.user.id, today: req.today, timezone: req.clientTimezone };
    const { aiMode, throttled, results } = await captureText(ctx, text.trim());
    if (!results[0].ai) {
      return res.json({ task: results[0].task, ai: null, fallback: aiMode !== 'off', aiOff: aiMode === 'off', throttled });
    }
    const [first] = results;
    res.json({
      task: first.task, ai: first.ai, bookedSlot: first.bookedSlot,
      slotSearchFailed: results.some(r => r.slotSearchFailed),
      routedToInbox: first.routedToInbox,
      tasks: results.map(r => ({ task: r.task, ai: r.ai, bookedSlot: r.bookedSlot, routedToInbox: r.routedToInbox })),
    });
  } catch (error) {
    console.error('Smart capture error:', error);
    serverError(req, res, error);
  }
});

router.get('/usage', async (req, res) => {
  try {
    res.json(await getStatus(req.user.id, req.today));
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/process-inbox', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const allInbox = await TaskModel.getAll('inbox', req.user.id);
    if (allInbox.length === 0) {
      return res.json({ message: 'Inbox is empty', processed_items: [] });
    }

    const [userContexts, allProjects, history] = await Promise.all([
      getUserContexts(req.user.id),
      ProjectModel.getAll(req.user.id),
      getRecentClassifiedTasks(req.user.id, 10),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    // One batch per call; the rest wait for the next run (the client shows
    // what's left in the inbox). original_index refers to this batch.
    const inboxTasks = allInbox.slice(0, AI_INPUT_CAPS.inboxItems);
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const result = await processInbox(inboxTasks, userContexts, {
      projects, today: req.today, dayName, history,
    });
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);

    // Resolve AI project_name suggestions to ids so the client can apply them
    // directly, and normalize the time field to the apply-route's name (same
    // contract as import-notes).
    if (Array.isArray(result.processed_items)) {
      result.processed_items = result.processed_items.map(item => {
        let project_id = null;
        if (item.project_name) {
          const match = projects.find(p => p.name.toLowerCase() === item.project_name.toLowerCase());
          if (match) project_id = match.id;
        }
        return { ...item, project_id, time_estimate: item.time_estimate ?? item.time_estimate_minutes ?? null };
      });
    }

    result.tasks = inboxTasks;
    result.remaining = allInbox.length - inboxTasks.length;
    res.json(result);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/apply-inbox-processing', async (req, res) => {
  try {
    const { items } = req.body;

    const updatedTasks = await Promise.all(items.map(item => {
      const updates = {
        list: item.recommended_list,
        context: item.context,
        priority: item.priority,
      };
      if (item.suggested_title) updates.title = item.suggested_title;
      if (item.project_id !== undefined) updates.project_id = item.project_id ? parseInt(item.project_id) : null;
      if (item.due_date !== undefined) updates.due_date = item.due_date || null;
      if (item.energy_level !== undefined) updates.energy_level = item.energy_level || null;
      if (item.time_estimate !== undefined) updates.time_estimate = item.time_estimate || null;
      if (item.is_daily_focus !== undefined) updates.is_daily_focus = !!item.is_daily_focus;
      if (item.waiting_for_person !== undefined) updates.waiting_for_person = item.waiting_for_person || null;
      return TaskModel.update(item.task_id, updates, req.user.id);
    }));

    res.json(updatedTasks);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/daily-priorities', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const [nextActions, stats] = await Promise.all([
      TaskModel.getAll('next_actions', req.user.id, req.today),
      TaskModel.getStats(req.user.id, req.today, req.clientTimezone),
    ]);

    if (nextActions.length === 0) {
      return res.json({
        message: 'No next actions available',
        suggested_focus: [],
        productivity_tip: 'Process your inbox to identify next actions!'
      });
    }

    const userContexts = await getUserContexts(req.user.id);
    // Time already committed today (time-blocked tasks) so the AI can size
    // its suggestions to the space actually left in the day.
    const { rows: [load] } = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(COALESCE(duration, 60)), 0)::int AS minutes
       FROM tasks
       WHERE user_id = $1 AND due_date = $2 AND scheduled_time IS NOT NULL AND list != 'completed'`,
      [req.user.id, req.today]
    );
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const result = await getDailyPriorities(nextActions, stats, userContexts, {
      today: req.today, dayName,
      scheduledToday: load?.count ? load : null,
    });
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);

    result.tasks = nextActions;
    res.json(result);
  } catch (error) {
    serverError(req, res, error);
  }
});

// Minutes-of-day right now in the user's timezone, so today's planning never
// places blocks in the past (open the app at 16:00 → morning windows are gone).
function minutesNowIn(tz) {
  try {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date()).split(':').map(Number);
    return h * 60 + m;
  } catch {
    return null;
  }
}

// Named busy items for the prompt and the brief ("around your two meetings"):
// today's Google events plus the user's own already-time-blocked tasks.
function buildMeetings(dayShape, today, timeZone) {
  return [
    ...dayShape.gcalEvents
      .filter(e => !e.all_day && e.start_time && e.end_time)
      .map(e => {
        const interval = eventMinutesOnDay(e.start_time, e.end_time, today, timeZone);
        return interval ? { title: e.title, start: interval[0], end: interval[1] } : null;
      })
      .filter(Boolean),
    ...dayShape.ownTasks
      .filter(t => t.due_date === today && t.scheduled_time)
      .map(t => ({
        title: t.title,
        start: timeToMinutes(t.scheduled_time),
        end: timeToMinutes(t.scheduled_time) + (t.duration || 60),
      })),
  ].filter(m => m.start != null && m.end != null).sort((a, b) => a.start - b.start);
}

// Unscheduled next actions — what the planner would plan. Shared by plan-day
// and the brief so their counts agree.
// A date on a task is its do-date in Cleartable (apply-plan writes due_date =
// today), so a task dated for a later day is already placed and must not be
// pulled into today. Tasks already time-blocked today are busy ranges, not
// candidates. Undated, overdue and due-today tasks remain.
async function planCandidates(userId, today) {
  const nextActions = await TaskModel.getAll('next_actions', userId, today);
  return nextActions.filter(t => {
    const due = t.due_date ? String(t.due_date).slice(0, 10) : null;
    if (due && due > today) return false;
    return !(due === today && t.scheduled_time);
  });
}

// The morning brief: the deterministic half of the planning ritual. No AI
// call and no aiLimit — just the shape of the day (free time left, meetings,
// candidates) or, once a plan is applied, its progress. The client renders
// this as the "Plan my day?" banner on first open of the day.
router.get('/day-brief', async (req, res) => {
  try {
    const [dayShape, candidates, planRow] = await Promise.all([
      freeRangesFor(req.user.id, req.today, req.clientTimezone),
      planCandidates(req.user.id, req.today),
      pool.query('SELECT applied_at FROM daily_plans WHERE user_id = $1 AND plan_date = $2', [req.user.id, req.today]),
    ]);
    const free = clampRangesToNow(dayShape.free, minutesNowIn(req.clientTimezone));
    const freeMins = free.reduce((sum, r) => sum + (r.end - r.start), 0);
    const meetings = buildMeetings(dayShape, req.today, req.clientTimezone).length;

    let plan = null;
    let unfinished = [];
    const row = planRow.rows[0];
    if (row) {
      const { rows: blocks } = await pool.query(
        `SELECT id, title, scheduled_time, duration, list
         FROM tasks
         WHERE user_id = $1 AND due_date = $2 AND scheduled_time IS NOT NULL
           AND (list = 'completed' OR is_daily_focus = true)
         ORDER BY scheduled_time`,
        [req.user.id, req.today]
      );
      const done = blocks.filter(b => b.list === 'completed').length;
      unfinished = blocks
        .filter(b => b.list !== 'completed')
        .map(b => ({ id: b.id, title: b.title, scheduled_time: b.scheduled_time, duration: b.duration }));
      plan = { applied: !!row.applied_at, done, total: blocks.length };
    }

    // Retention metric + calm meta for the shutdown card. Applied plans only —
    // proposals the user walked away from don't count as planned days.
    const { rows: [planned] } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM daily_plans WHERE user_id = $1 AND applied_at IS NOT NULL',
      [req.user.id]
    );

    res.json({ date: req.today, freeMins, meetings, candidates: candidates.length, plan, unfinished, daysPlanned: planned.cnt });
  } catch (error) {
    serverError(req, res, error);
  }
});

// The day planner. Candidates are next actions only — inbox is unclarified,
// waiting_for is blocked on someone else, someday is parked; none belong in a
// time-blocked day. Tasks already time-blocked today are busy ranges, not
// candidates. The AI proposes; packPlan (inside planDay) guarantees the
// result is conflict-free; the user reviews before anything is applied.
router.post('/plan-day', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    await assertPlanWithinLimit(req.user.id, req.today);

    const [allCandidates, dayShape, userContexts, reality] = await Promise.all([
      planCandidates(req.user.id, req.today),
      freeRangesFor(req.user.id, req.today, req.clientTimezone),
      getUserContexts(req.user.id),
      // What this person's planned days actually looked like — feeds the
      // "what we know about you" paragraph and, past 10 days, a block cap.
      planReality(req.user.id, req.clientTimezone, { today: req.today }).catch(err => { console.error('planReality:', err); return null; }),
    ]);

    const candidates = allCandidates.slice(0, 40); // bound the prompt; ordered by priority DESC

    if (candidates.length === 0) {
      return res.json({
        plan: [], deferred: [], overloaded: false, tasks: [],
        summary: 'Nothing to plan — no unscheduled next actions right now.',
      });
    }

    // Only the part of the day that's still ahead is plannable.
    const freeRanges = clampRangesToNow(dayShape.free, minutesNowIn(req.clientTimezone));
    const totalFreeMins = freeRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
    const meetings = buildMeetings(dayShape, req.today, req.clientTimezone);

    const { rows: habitRows } = await pool.query(
      `SELECT h.id, h.name, (hl.id IS NOT NULL) AS completed_today
       FROM habits h
       LEFT JOIN habit_logs hl ON hl.habit_id = h.id AND hl.completed_date = $2 AND hl.status = 'done'
       WHERE h.user_id = $1 AND h.active = true
       ORDER BY h.name`,
      [req.user.id, req.today]
    );
    // Habits with a time already sit inside `busy`; tell the model when they are.
    const habitSlot = new Map(dayShape.habitBlocks.filter(b => b.start != null).map(b => [b.habitId, `${minutesToTime(b.start)}-${minutesToTime(b.end)}`]));
    const habits = habitRows.map(h => ({ name: h.name, completed_today: h.completed_today, time: habitSlot.get(h.id) || null }));

    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const result = await planDay(candidates, {
      today: req.today,
      dayName,
      freeRanges,
      totalFreeMins,
      workStart: dayShape.workStart,
      workEnd: dayShape.workEnd,
      meetings,
      habits,
      profile: planningProfileText(reality),
      maxBlocks: reality?.level === 'firm' ? reality.suggestedBlocks : null,
    }, userContexts);
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);
    result.calibration = calibrationLine(reality, result.plan.length);

    // Store the proposal WITHOUT touching applied_at. Re-proposing a day whose
    // plan is already applied (e.g. tapping "Plan my day" again in the afternoon
    // and then cancelling) must not wipe the applied state — that would erase the
    // progress line, the evening shutdown card, and the day's retention credit for
    // a plan still in effect. applied_at is set only when a plan is actually applied.
    await pool.query(
      `INSERT INTO daily_plans (user_id, plan_date, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plan_date) DO UPDATE SET payload = $3, created_at = NOW()`,
      [req.user.id, req.today, JSON.stringify(result)]
    );

    result.tasks = candidates;
    // Shown alongside the proposed blocks so the plan reads as the whole day.
    result.habitBlocks = dayShape.habitBlocks
      .filter(b => b.start != null && b.status !== 'done')
      .map(b => ({ habitId: b.habitId, name: b.name, color: b.color, start: minutesToTime(b.start), duration: b.end - b.start }));
    res.json(result);
  } catch (error) {
    if (error instanceof LimitError) {
      return res.status(402).json({ error: error.message, code: error.code, resource: error.resource, limit: error.limit });
    }
    serverError(req, res, error);
  }
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

// A task listed twice in one apply would be written twice and synced twice
// (and hit plan_blocks' unique index). Keep the last entry per task, the
// person's final placement.
function lastPerTask(list) {
  const byId = new Map();
  for (const item of list) {
    if (item && item.taskId != null) byId.set(Number(item.taskId), item);
  }
  return [...byId.values()];
}

// Applies a reviewed plan: kept blocks become today's time-blocked focus,
// deferred items move to their new date. ADDITIVE — it only touches the tasks in
// the plan, and never clears focus on tasks the user didn't act on. The old
// "clear is_daily_focus on every next action first" pass caused two bugs: applying
// a plan with all blocks skipped wiped a hand-curated Today list (M1), and a
// same-day replan orphaned the previous plan's unfinished blocks — they lost focus,
// kept a stale past time, and dropped out of every ritual surface (H6). plan-day's
// candidates already exclude tasks scheduled today, so re-planning is inherently
// "plan the rest," not "replace the day." No AI call → no aiLimit.
router.post('/apply-plan', async (req, res) => {
  try {
    // Same shape checks as apply-week: a garbage time used to be stored as-is
    // (and fail the Calendar sync), a garbage move-to date 500'd halfway
    // through, after the kept blocks were already written.
    const items = lastPerTask(Array.isArray(req.body.items) ? req.body.items : [])
      .filter(i => Number.isInteger(Number(i.taskId)) && TIME_RE.test(i.start || ''))
      .slice(0, 100);
    const deferred = lastPerTask(Array.isArray(req.body.deferred) ? req.body.deferred : [])
      .filter(d => Number.isInteger(Number(d.taskId)) && (!d.moveTo || isRealDate(d.moveTo)))
      .slice(0, 100);
    if (items.length === 0 && deferred.length === 0) {
      return res.status(400).json({ error: 'Nothing to apply' });
    }

    const updated = [];
    const { rows: estRows } = await pool.query(
      'SELECT id, time_estimate FROM tasks WHERE user_id = $1 AND id = ANY($2::int[])',
      [req.user.id, items.map(i => Number(i.taskId)).filter(Number.isInteger)]
    );
    const hasEstimate = new Map(estRows.map(r => [r.id, !!r.time_estimate]));
    for (const item of items) {
      const task = await TaskModel.update(item.taskId, {
        due_date: req.today,
        scheduled_time: item.start,
        duration: Math.min(480, Math.max(5, Number(item.duration) || 30)),
        // A block the person accepted is the best estimate a task without one
        // will get; keep it so tomorrow's plan doesn't start from 30 again.
        ...(hasEstimate.get(Number(item.taskId)) === false ? { time_estimate: item.duration || 30 } : {}),
        is_daily_focus: true,
      }, req.user.id);
      if (task) {
        updated.push(task);
        syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (apply-plan):', err));
      }
    }
    for (const d of deferred) {
      if (!d.moveTo) continue;
      const task = await TaskModel.update(d.taskId, {
        due_date: d.moveTo,
        scheduled_time: null,
        is_daily_focus: false,
      }, req.user.id);
      if (task) syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (apply-plan defer):', err));
    }

    await pool.query(
      'UPDATE daily_plans SET applied_at = NOW() WHERE user_id = $1 AND plan_date = $2',
      [req.user.id, req.today]
    );
    // Fact record for Insights + planner calibration: which task sat in which
    // block. Only blocks whose task update succeeded.
    const appliedIds = new Set(updated.map(t => t.id));
    recordAppliedBlocks(req.user.id, req.today, items.filter(i => appliedIds.has(Number(i.taskId))))
      .catch(err => console.error('recordAppliedBlocks:', err));

    res.json({ applied: updated.length, deferred: deferred.length, tasks: updated });
  } catch (error) {
    serverError(req, res, error);
  }
});

// Evening shutdown: one-tap outcomes for a planned block that didn't happen.
//   tomorrow — move to tomorrow, unscheduled (decide the time then)
//   slot     — move to tomorrow into the first free slot (deterministic, no AI)
//   release  — back to plain next actions, no date; today just didn't have room
// Each mode clears today's focus/schedule so the day can actually end.
router.post('/shutdown-defer', async (req, res) => {
  try {
    const { taskId, mode } = req.body;
    if (!taskId || !['tomorrow', 'slot', 'release'].includes(mode)) {
      return res.status(400).json({ error: 'taskId and a valid mode are required' });
    }
    const d = new Date(req.today + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const tomorrow = d.toISOString().slice(0, 10);

    let updates;
    if (mode === 'release') {
      updates = { due_date: null, scheduled_time: null, is_daily_focus: false };
    } else if (mode === 'slot') {
      const existing = await TaskModel.getById(taskId, req.user.id);
      if (!existing) return res.status(404).json({ error: 'Task not found' });
      const time = await findFreeSlot(req.user.id, tomorrow, existing.duration || 30, req.clientTimezone);
      // A full tomorrow degrades to plain "tomorrow" rather than failing.
      updates = { due_date: tomorrow, scheduled_time: time, is_daily_focus: false };
    } else {
      updates = { due_date: tomorrow, scheduled_time: null, is_daily_focus: false };
    }

    // Record the outcome first: moving the task off today releases any open
    // block for today as 'replanned', which would swallow this outcome.
    await closeBlock(req.user.id, Number(taskId), mode).catch(err => console.error('closeBlock (shutdown):', err));
    const task = await TaskModel.update(taskId, updates, req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (shutdown):', err));
    res.json({ task, mode, moved_to: updates.due_date, scheduled_time: updates.scheduled_time ?? null });
  } catch (error) {
    serverError(req, res, error);
  }
});


// ---------------------------------------------------------------------------
// Plan my week — WHICH day each task belongs to; the morning planner does times.

const WEEK_DAYS = 7;
const MAX_WEEK_CANDIDATES = 60;

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayNameOf(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

// The shape of the coming days: free minutes after meetings and time blocks,
// tasks already given a time on each day (fixed, not candidates), and a
// capacity that leaves slack and scales by how much of a planned day this
// person finishes. Dated tasks without a time are candidates, so they aren't
// counted here a second time.
async function weekShape(userId, start, tz, reality, today = start) {
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i));
  const end = dates[dates.length - 1];
  const { rows: fixedRows } = await pool.query(
    `SELECT id, title, due_date, scheduled_time, time_estimate, duration
       FROM tasks
      WHERE user_id = $1 AND list IN ('next_actions', 'inbox')
        AND scheduled_time IS NOT NULL
        AND due_date BETWEEN $2::date AND $3::date
      ORDER BY due_date, scheduled_time`,
    [userId, start, end]
  );
  const finishFactor = reality && reality.level !== 'none'
    ? Math.min(1, Math.max(0.5, reality.completionRate))
    : 1;
  const nowMins = minutesNowIn(tz);

  const days = [];
  for (const date of dates) {
    const shape = await freeRangesFor(userId, date, tz);
    // Only today's remaining hours are shrunk to "from now"; a week that
    // starts tomorrow keeps tomorrow whole.
    const free = date === today ? clampRangesToNow(shape.free, nowMins) : shape.free;
    const freeMins = free.reduce((sum, r) => sum + (r.end - r.start), 0);
    const busyMins = shape.busy.reduce((sum, r) => sum + (r.end - r.start), 0);
    const meetings = buildMeetings(shape, date, tz).length;
    // Timed tasks are already inside `busy`; they're listed so the model
    // knows the day isn't empty.
    const fixed = fixedRows
      .filter(r => dateOnly(r.due_date) === date)
      .map(r => ({ id: r.id, title: r.title, mins: r.scheduled_time ? 0 : (r.time_estimate || r.duration || 30), timed: !!r.scheduled_time }));
    const fixedMins = fixed.reduce((sum, f) => sum + f.mins, 0);
    const capacityMins = Math.max(0, Math.round((freeMins * 0.8 - fixedMins) * finishFactor));
    days.push({ date, dayName: dayNameOf(date), freeMins, busyMins, meetings, fixed, fixedMins, capacityMins, workStart: shape.workStart, workEnd: shape.workEnd });
  }
  return { days, start, end, finishFactor };
}

// Candidates: next actions that may start by the window's end, plus inbox
// tasks with a deadline by then (a deadline counts whatever list it sits in).
// A due date is a deadline, not a booking: reconcileWeek places the task on a
// day up to it. Only tasks already given a time in the window stay put.
// Dated tasks go first so the cap never drops a deadline.
async function weekCandidates(userId, start, end, today) {
  const [next, inbox] = await Promise.all([
    TaskModel.getAll('next_actions', userId, end),
    TaskModel.getAll('inbox', userId, end),
  ]);
  const dueBy = (t) => { const due = dateOnly(t.due_date); return !!due && due <= end; };
  return [...next, ...inbox.filter(dueBy)]
    .filter(t => {
      const due = dateOnly(t.due_date);
      const from = dateOnly(t.start_date);
      if (from && from > end) return false;
      if (t.scheduled_time && due && due >= start && due <= end) return false; // has its time already
      if (due === today && t.scheduled_time) return false;
      return true;
    })
    .sort((a, b) => Number(dueBy(b)) - Number(dueBy(a)))
    .slice(0, MAX_WEEK_CANDIDATES);
}

// Inbox tasks the week leaves alone (no deadline by its end), so the board can
// say they weren't forgotten.
async function inboxNotPlanned(userId, end) {
  const { rows: [row] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tasks
      WHERE user_id = $1 AND list = 'inbox'
        AND (due_date IS NULL OR due_date > $2::date)`,
    [userId, end]
  );
  return row.n;
}

// Deterministic guarantee layer: bounds and capacity hold whatever the model said.
function reconcileWeek(proposal, tasks, days) {
  const byDate = new Map(days.map(d => [d.date, { ...d, used: 0 }]));
  const dates = days.map(d => d.date);
  const start = dates[0], end = dates[dates.length - 1];
  const placed = [];
  const unplaced = [];
  const seen = new Set();
  // Tasks without an estimate get the model's (asked for per task in the
  // prompt); 30 only as the very last resort. Surfaced to the board and
  // written back on apply so the estimate sticks for the daily planner.
  const aiEstimates = new Map();
  for (const pl of [...(proposal.placements || []), ...(proposal.unplaced || [])]) {
    const t = tasks[pl.task_index - 1];
    if (t && !t.time_estimate && pl.estimate_mins) aiEstimates.set(t.id, pl.estimate_mins);
  }
  const minsOf = (t) => t.time_estimate || aiEstimates.get(t.id) || 30;

  // Overdue tasks are already late: any day this week beats "never", so they
  // keep the whole window (the first day is still preferred via `wanted`).
  const boundsFor = (t) => {
    const from = dateOnly(t.start_date);
    const due = dateOnly(t.due_date);
    const lo = from && from > start ? from : start;
    let hi = end;
    if (due && due >= start && due < end) hi = due;
    return { lo, hi: hi < lo ? lo : hi };
  };

  const tryPlace = (t, idx, wanted, reason) => {
    const { lo, hi } = boundsFor(t);
    const candidates = dates.filter(d => d >= lo && d <= hi);
    const order = wanted && candidates.includes(wanted) ? [wanted, ...candidates.filter(d => d !== wanted)] : candidates;
    for (const d of order) {
      const day = byDate.get(d);
      if (day.used + minsOf(t) <= day.capacityMins || (day.used === 0 && day.capacityMins > 0)) {
        day.used += minsOf(t);
        placed.push({ task_index: idx, taskId: t.id, date: d, reason: d === wanted ? reason : (reason ? `${reason} (moved to ${dayNameOf(d)} to fit)` : `Fits on ${dayNameOf(d)}.`) });
        return true;
      }
    }
    return false;
  };

  for (const pl of proposal.placements || []) {
    const t = tasks[pl.task_index - 1];
    if (!t || seen.has(pl.task_index)) continue;
    seen.add(pl.task_index);
    if (!tryPlace(t, pl.task_index, pl.date, pl.reason)) {
      unplaced.push({ task_index: pl.task_index, taskId: t.id, reason: 'No room left in the week within its dates.' });
    }
  }
  for (const u of proposal.unplaced || []) {
    const t = tasks[u.task_index - 1];
    if (!t || seen.has(u.task_index)) continue;
    seen.add(u.task_index);
    unplaced.push({ task_index: u.task_index, taskId: t.id, reason: u.reason || 'Left out to keep the week realistic.' });
  }
  // Anything the model forgot: overdue/due items get a forced attempt, the rest stays unplaced.
  tasks.forEach((t, i) => {
    const idx = i + 1;
    if (seen.has(idx)) return;
    const due = dateOnly(t.due_date);
    if (due && due <= end && tryPlace(t, idx, null, 'Has a due date this week.')) return;
    unplaced.push({ task_index: idx, taskId: t.id, reason: 'Not placed — the week is full or it can wait.' });
  });

  return {
    placements: placed,
    unplaced,
    estimates: Object.fromEntries(aiEstimates),
    days: days.map(d => ({ ...d, plannedMins: byDate.get(d.date).used })),
  };
}

// GET /api/ai/week-brief?start=YYYY-MM-DD — deterministic, no AI, no charge.
router.get('/week-brief', async (req, res) => {
  try {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query.start || '') ? req.query.start : req.today;
    const reality = await planReality(req.user.id, req.clientTimezone, { today: req.today }).catch(() => null);
    const shape = await weekShape(req.user.id, start, req.clientTimezone, reality, req.today);
    const [candidates, inboxLeft] = await Promise.all([
      weekCandidates(req.user.id, shape.start, shape.end, req.today),
      inboxNotPlanned(req.user.id, shape.end),
    ]);
    const { rows: [row] } = await pool.query(
      'SELECT applied_at, created_at FROM weekly_plans WHERE user_id = $1 AND week_start = $2',
      [req.user.id, start]
    );
    res.json({ ...shape, candidates: candidates.length, inboxNotPlanned: inboxLeft, existingPlan: row ? { applied: !!row.applied_at, createdAt: row.created_at } : null });
  } catch (error) {
    serverError(req, res, error);
  }
});

// The week window starts today, or within the next few days if the client asks
// (the free-plan gate counts applied weeks per month by week_start, so a start
// picked freely — next month, or a date nobody planned — slipped past it).
// Anything else, including impossible dates like 2026-13-45, becomes today.
const WEEK_START_MAX_AHEAD_DAYS = 6;
function weekStartFrom(req) {
  const s = req.body?.start;
  if (!isRealDate(s)) return req.today;
  if (s < req.today || s > addDays(req.today, WEEK_START_MAX_AHEAD_DAYS)) return req.today;
  return s;
}

// POST /api/ai/plan-week { start } — one AI call, charged like plan-day.
router.post('/plan-week', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const start = weekStartFrom(req);
    await assertWeekPlanWithinLimit(req.user.id, start);

    const [reality, userContexts] = await Promise.all([
      planReality(req.user.id, req.clientTimezone, { today: req.today }).catch(() => null),
      getUserContexts(req.user.id),
    ]);
    const shape = await weekShape(req.user.id, start, req.clientTimezone, reality, req.today);
    const [candidates, inboxLeft] = await Promise.all([
      weekCandidates(req.user.id, shape.start, shape.end, req.today),
      inboxNotPlanned(req.user.id, shape.end),
    ]);

    if (candidates.length === 0) {
      return res.json({ ...shape, placements: [], unplaced: [], tasks: [], inboxNotPlanned: inboxLeft, summary: 'Nothing to plan — every next action already has a time or waits on a start date.' });
    }

    const result = await planWeek(candidates, { days: shape.days, profile: planningProfileText(reality) }, userContexts);
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);

    const reconciled = reconcileWeek(result, candidates, shape.days);
    const payload = { ...reconciled, summary: result.summary, start: shape.start, end: shape.end, finishFactor: shape.finishFactor, inboxNotPlanned: inboxLeft };
    await pool.query(
      `INSERT INTO weekly_plans (user_id, week_start, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, week_start) DO UPDATE SET payload = $3, created_at = NOW()`,
      [req.user.id, start, JSON.stringify(payload)]
    );
    res.json({ ...payload, tasks: candidates });
  } catch (error) {
    if (error instanceof LimitError) {
      return res.status(402).json({ error: error.message, code: error.code, resource: error.resource, limit: error.limit });
    }
    serverError(req, res, error);
  }
});


// Union of {start,end} minute ranges, sorted.
function mergeRanges(ranges) {
  const out = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// POST /api/ai/week-times { start, placements: [{ taskId, date, estimate?, start? }] }
// Deterministic time windows for a day-distributed week. No AI: the model
// already chose the days; here each day's tasks are packed into that day's
// free ranges (meetings and existing blocks respected, today clamped to now).
// Heuristic order: due/overdue first, then priority, then energy — high-energy
// work is proposed at the start of the day's longest window, everything else
// takes the earliest slot that fits. Fine-tuning stays in the Calendar.
router.post('/week-times', async (req, res) => {
  try {
    const start = weekStartFrom(req);
    const end = addDays(start, WEEK_DAYS - 1);
    const placements = (Array.isArray(req.body?.placements) ? req.body.placements : [])
      .filter(p => Number.isInteger(Number(p.taskId)) && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') && p.date >= start && p.date <= end);
    if (placements.length === 0) return res.json({ times: [], unfit: [] });

    const ids = [...new Set(placements.map(p => Number(p.taskId)))];
    const { rows: taskRows } = await pool.query(
      `SELECT id, title, due_date, priority, energy_level, time_estimate, duration FROM tasks WHERE user_id = $1 AND id = ANY($2::int[])`,
      [req.user.id, ids]
    );
    const tasks = new Map(taskRows.map(t => [t.id, t]));
    const nowMins = minutesNowIn(req.clientTimezone);
    const times = [];
    const unfit = [];

    // Per placement: the planner's estimate for a task that has none (so the
    // slot matches the size the board shows), and a start the person pinned
    // by dragging the block in the Calendar.
    const byDate = new Map();
    for (const p of placements) {
      const t = tasks.get(Number(p.taskId));
      if (!t) continue;
      const est = Number(p.estimate);
      const pinned = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.start || '') ? timeToMinutes(p.start) : null;
      if (!byDate.has(p.date)) byDate.set(p.date, []);
      byDate.get(p.date).push({ ...t, _est: Number.isFinite(est) && est > 0 ? est : null, _pinned: pinned });
    }

    for (const [date, list] of byDate) {
      const shape = await freeRangesFor(req.user.id, date, req.clientTimezone);
      let free = date === req.today ? clampRangesToNow(shape.free, nowMins) : shape.free;
      // A start the person picked by hand is honored outside working hours
      // too, as long as it doesn't overlap a meeting: open that span up.
      const allDayFree = freeRangesFrom(shape.busy, 0, 24 * 60);
      for (const t of list) {
        if (t._pinned == null) continue;
        const span = { start: t._pinned, end: t._pinned + Math.min(480, Math.max(5, Math.round(t.time_estimate || t._est || 30))) };
        if (date === req.today && nowMins != null && span.start < nowMins) continue;
        if (!allDayFree.some(r => r.start <= span.start && span.end <= r.end)) continue;
        free = mergeRanges([...free, span]);
      }
      const longest = free.reduce((a, r) => (!a || (r.end - r.start) > (a.end - a.start) ? r : a), null);
      const rank = (t) => {
        const due = dateOnly(t.due_date);
        const dueScore = due && due <= date ? 0 : 1;
        const energy = { high: 0, medium: 1, low: 2 }[t.energy_level] ?? 1;
        return [dueScore, -(t.priority || 0), energy, -(t.time_estimate || 30)];
      };
      const ordered = [...list].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
        return 0;
      });
      const blocks = ordered.map((t, i) => ({
        task_index: t.id,
        duration: Math.min(480, Math.max(5, Math.round(t.time_estimate || t._est || 30))),
        // A pinned start wins. Otherwise only the first high-energy task claims
        // the longest window; the rest flow into the earliest slot so mornings
        // aren't all deep work.
        start: t._pinned != null ? t._pinned
          : (t.energy_level === 'high' && longest && i === ordered.findIndex(x => x.energy_level === 'high')) ? longest.start : null,
      }));
      const { placed, overflow } = packPlan(blocks, free);
      for (const b of placed) times.push({ taskId: b.task_index, date, start: minutesToTime(b.start), duration: b.duration });
      for (const b of overflow) unfit.push({ taskId: b.task_index, date });
    }
    res.json({ times, unfit });
  } catch (error) {
    serverError(req, res, error);
  }
});

// POST /api/ai/apply-week { start, items: [{ taskId, date, start?, duration? }] }
// Writes the do-date; with `start` it also writes the time block (and the
// Google Calendar sync picks it up). Additive: tasks not in `items` are
// untouched. No AI → no aiLimit.
router.post('/apply-week', async (req, res) => {
  try {
    const start = weekStartFrom(req);
    const end = addDays(start, WEEK_DAYS - 1);
    const items = lastPerTask((Array.isArray(req.body?.items) ? req.body.items : [])
      .filter(i => Number.isInteger(Number(i.taskId)) && /^\d{4}-\d{2}-\d{2}$/.test(i.date || '') && i.date >= start && i.date <= end));
    if (items.length === 0) return res.status(400).json({ error: 'Nothing to apply' });
    // Only a week that plan-week actually produced (and the free gate let
    // through) can be applied; applying marks that row, which is what the gate
    // counts next time.
    const { rowCount: hasPlan } = await pool.query(
      'SELECT 1 FROM weekly_plans WHERE user_id = $1 AND week_start = $2',
      [req.user.id, start]
    );
    if (!hasPlan) {
      return res.status(409).json({ error: 'no_week_plan', message: 'This week plan has expired — plan the week again and apply that.' });
    }
    if (items.length > 100) items.length = 100;

    const updated = [];
    const timedByDate = new Map();
    for (const item of items) {
      const timed = /^([01]\d|2[0-3]):[0-5]\d$/.test(item.start || '');
      const est = Number(item.estimate);
      const task = await TaskModel.update(Number(item.taskId), {
        due_date: item.date,
        // With time windows on, the week writes the block too; otherwise the
        // morning planner does it and any old time is cleared.
        scheduled_time: timed ? item.start : null,
        ...(timed ? { duration: Math.min(480, Math.max(5, Number(item.duration) || 30)) } : {}),
        // The planner's estimate for a task that had none becomes the task's
        // estimate, so the next plan (and the person) start from it.
        ...(Number.isFinite(est) && est > 0 ? { time_estimate: Math.min(480, Math.max(5, Math.round(est))) } : {}),
        is_daily_focus: false,
      }, req.user.id);
      if (task) {
        updated.push(task);
        if (timed) {
          if (!timedByDate.has(item.date)) timedByDate.set(item.date, []);
          timedByDate.get(item.date).push({ taskId: task.id, start: item.start, duration: task.duration || 30 });
        }
        syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (apply-week):', err));
      }
    }
    // Timed blocks are planned days as far as Insights and calibration are concerned.
    for (const [date, blocks] of timedByDate) {
      recordAppliedBlocks(req.user.id, date, blocks).catch(err => console.error('recordAppliedBlocks (apply-week):', err));
    }
    await pool.query(
      `UPDATE weekly_plans
          SET applied_at = NOW(),
              payload = payload || jsonb_build_object('applied', $3::jsonb)
        WHERE user_id = $1 AND week_start = $2`,
      [req.user.id, start, JSON.stringify(items)]
    );
    res.json({ applied: updated.length, tasks: updated });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/import-notes', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }
    if (text.length > MAX_NOTES_CHARS) {
      return res.status(413).json({
        error: 'text_too_long',
        message: `That's over ${MAX_NOTES_CHARS.toLocaleString()} characters — split it into smaller chunks.`,
      });
    }

    const [userContexts, allProjects] = await Promise.all([
      getUserContexts(req.user.id),
      ProjectModel.getAll(req.user.id),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    const today = req.today;
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const result = await importNotes(text, userContexts, projects, today, dayName);
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);

    if (Array.isArray(result.items)) {
      result.items = result.items.map(item => {
        let project_id = null;
        if (item.project_name) {
          const match = projects.find(p => p.name.toLowerCase() === item.project_name.toLowerCase());
          if (match) project_id = match.id;
        }
        return { ...item, project_id };
      });
    }

    res.json(result);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/apply-import', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items to import' });
    }

    const created = await Promise.all(items.map(item =>
      TaskModel.create({
        title: item.title,
        notes: item.notes || null,
        list: item.recommended_list || 'inbox',
        context: item.context || null,
        project_id: item.project_id ? parseInt(item.project_id) : null,
        waiting_for_person: item.waiting_for_person || null,
        due_date: item.due_date || null,
        priority: item.priority || null,
        energy_level: item.energy_level || null,
        time_estimate: item.time_estimate || null,
        is_daily_focus: !!item.is_daily_focus,
      }, req.user.id)
    ));

    res.json({ count: created.length, tasks: created });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/apply-daily-focus', async (req, res) => {
  try {
    const { taskIds } = req.body;

    // Clear daily focus on all current next-actions, then set on the chosen ones.
    // Could be done as two SQL statements directly but going through TaskModel
    // keeps the auto-promotion + updated_at semantics consistent.
    const nextActions = await TaskModel.getAll('next_actions', req.user.id, req.today);
    await Promise.all(nextActions.map(task =>
      TaskModel.update(task.id, { is_daily_focus: false }, req.user.id)
    ));

    const updatedTasks = await Promise.all(taskIds.map(id =>
      TaskModel.update(id, { is_daily_focus: true }, req.user.id)
    ));

    res.json(updatedTasks);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/find-duplicates', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const lists = await Promise.all(
      ['inbox', 'next_actions', 'waiting_for', 'someday_maybe'].map(list =>
        TaskModel.getAll(list, req.user.id, req.today)
      )
    );
    // Most recently touched first: new duplicates are the ones worth catching,
    // and the cap keeps a years-old backlog from becoming one giant prompt.
    const allTasks = lists.flat()
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, AI_INPUT_CAPS.duplicateTasks);

    if (allTasks.length < 2) {
      return res.json({ duplicate_groups: [], summary: 'Not enough tasks to compare' });
    }

    const userContexts = await getUserContexts(req.user.id);
    const result = await findDuplicates(allTasks, userContexts);
    if (aiFailed(res, result)) return;
    await chargeAiUsage(req);

    // The model can only reference tasks we sent it — reject any id it invented
    // or transposed, and rebuild each group from authoritative DB rows (real id +
    // real title) so the client never renders a hallucinated title over a real id.
    // apply-duplicates deletes by id, so a bogus id here would delete the wrong
    // task. Keep only groups that still have ≥2 tasks and exactly one keep.
    const byId = new Map(allTasks.map(t => [t.id, t]));
    result.duplicate_groups = (result.duplicate_groups || [])
      .map(g => {
        const seen = new Set();
        const tasks = [];
        for (const t of (g.tasks || [])) {
          const real = byId.get(Number(t.id));
          if (!real || seen.has(real.id)) continue;
          seen.add(real.id);
          tasks.push({ id: real.id, title: real.title, list: real.list, keep: t.keep === true });
        }
        return { ...g, tasks };
      })
      .filter(g => g.tasks.length >= 2 && g.tasks.filter(t => t.keep).length === 1);

    res.json(result);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/apply-duplicates', async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!taskIds || taskIds.length === 0) {
      return res.status(400).json({ error: 'No tasks to remove' });
    }

    await Promise.all(taskIds.map(id => TaskModel.delete(id, req.user.id)));
    res.json({ count: taskIds.length });
  } catch (error) {
    serverError(req, res, error);
  }
});

// Same numbers as the Habits page (schedule-aware, rest days, quit habits, the
// user's own "today") — this used to be a second, older streak algorithm that
// counted plain consecutive calendar days in UTC.
async function getHabitStats(userId, today) {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 365);
  const [{ rows: habits }, { rows: allLogs }] = await Promise.all([
    pool.query('SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY name', [userId]),
    pool.query(
      'SELECT habit_id, completed_date, status FROM habit_logs WHERE user_id = $1 AND completed_date >= $2',
      [userId, since.toISOString().slice(0, 10)]
    ),
  ]);
  return { habits: summarizeHabits(habits, allLogs, today) };
}

// Everything the review needs, minus the AI. Shared by the page load and the
// on-demand analysis so both see the same snapshot.
async function loadReviewData(userId, req) {
  const [stats, inboxItems, nextActions, waitingFor, somedayMaybe, projects, staleItems, lastReview, streak, habitStats, userContexts] = await Promise.all([
    TaskModel.getStats(userId, req.today, req.clientTimezone),
    TaskModel.getAll('inbox', userId, req.today),
    TaskModel.getAll('next_actions', userId, req.today),
    TaskModel.getAll('waiting_for', userId, req.today),
    TaskModel.getAll('someday_maybe', userId, req.today),
    ProjectModel.getAll(userId),
    WeeklyReviewModel.getStaleItems(userId),
    WeeklyReviewModel.getLastReview(userId),
    WeeklyReviewModel.getStreak(userId),
    getHabitStats(userId, req.today),
    getUserContexts(userId),
  ]);
  const since = lastReview?.completed_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const completedThisWeek = await WeeklyReviewModel.getCompletedTasksSince(userId, since);
  return { stats, inboxItems, nextActions, waitingFor, somedayMaybe, projects, staleItems, lastReview, streak, habitStats, userContexts, completedThisWeek };
}

// Page load: data only, no AI call. This route auto-fires on mount, and running
// the (3000-token) analysis here meant every visit to the page burned a daily AI
// action the user never asked for — and, at ~20 visits, Groq's whole app-wide
// daily budget. The analysis is now a separate, explicit action below.
// `aiAnalysis` is null = "not requested yet"; {error:'ai_off'} tells the client
// to render the manual Reflect step instead.
router.post('/weekly-review', async (req, res) => {
  try {
    const userId = req.user.id;
    const aiMode = await getAiMode(userId);
    const { userContexts, staleItems, ...data } = await loadReviewData(userId, req);
    res.json({ ...data, aiAnalysis: aiMode === 'off' ? { error: 'ai_off' } : null });
  } catch (error) {
    serverError(req, res, error);
  }
});

// Explicit "Analyze my week" — the one AI call in the ritual, gated and charged
// like every other user-triggered AI action.
router.post('/weekly-review/analyze', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const d = await loadReviewData(userId, req);
    const aiAnalysis = await weeklyReviewAnalysis({
      stats: d.stats, nextActions: d.nextActions, waitingFor: d.waitingFor, somedayMaybe: d.somedayMaybe,
      projects: d.projects, staleItems: d.staleItems, habitStats: d.habitStats, completedThisWeek: d.completedThisWeek,
      lastReviewDate: d.lastReview?.completed_at || null,
    }, d.userContexts);
    if (aiFailed(res, aiAnalysis)) return;
    await chargeAiUsage(req);
    res.json({ aiAnalysis });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/complete-review', async (req, res) => {
  try {
    const { tasksCompleted = [], tasksDeleted = [], tasksMoved = [], inboxCountAtStart = 0, aiSummary } = req.body;
    const userId = req.user.id;

    await Promise.all([
      ...tasksCompleted.map(id => TaskModel.complete(id, userId)),
      ...tasksDeleted.map(id => TaskModel.delete(id, userId)),
      ...tasksMoved.map(({ id, toList }) => TaskModel.update(id, { list: toList }, userId)),
    ]);

    const review = await WeeklyReviewModel.create({
      inboxCountAtStart,
      tasksCompleted: tasksCompleted.length,
      tasksMoved: tasksMoved.length,
      tasksDeleted: tasksDeleted.length,
      aiSummary,
    }, userId);

    const streak = await WeeklyReviewModel.getStreak(userId);
    res.json({ review, streak });
  } catch (error) {
    serverError(req, res, error);
  }
});

export default router;
