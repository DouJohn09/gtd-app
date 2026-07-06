import { Router } from 'express';
import { TaskModel, ProjectModel, WeeklyReviewModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { processInbox, getDailyPriorities, importNotes, findDuplicates, weeklyReviewAnalysis, smartCapture, planDay } from '../services/ai.js';
import { syncTaskToCalendar } from '../services/googleCalendar.js';
import { findFreeSlot, freeRangesFor, timeToMinutes, isoToMinutesOfDay, clampRangesToNow } from '../services/scheduling.js';
import { consume, getStatus } from '../services/aiUsage.js';
import { enforceAiLimit } from '../middleware/aiLimit.js';
import { getAiMode } from '../services/userPrefs.js';
import { assertPlanWithinLimit, LimitError } from '../services/billing.js';

async function getUserContexts(userId) {
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
async function getRecentClassifiedTasks(userId, limit = 10) {
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

router.post('/smart-capture', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const rawText = text.trim();
    const urls = rawText.match(/https?:\/\/[^\s]+/gi) || [];
    // The user's ai_mode (not a client param) decides whether AI runs and how
    // aggressively it routes — a stale client can't re-enable AI for a user
    // who turned it off.
    const aiMode = await getAiMode(req.user.id);
    const [contexts, allProjects, history, openTitles] = await Promise.all([
      getUserContexts(req.user.id),
      ProjectModel.getAll(req.user.id),
      getRecentClassifiedTasks(req.user.id, 10),
      getOpenTaskTitles(req.user.id, 15),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    const today = req.today;
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    // Soft throttle: when the user is over their daily AI budget, skip the
    // OpenAI call entirely and fall back to raw capture rather than hard-blocking.
    // The task still lands in the inbox as plain text — just without enrichment.
    let ai = null;
    let throttled = false;
    if (aiMode !== 'off') {
      const budget = await consume(req.user.id);
      throttled = !budget.allowed;
      if (budget.allowed) {
        ai = await smartCapture(rawText, contexts, projects, today, dayName, history, openTitles);
        // No provider configured → same graceful raw-capture fallback as the
        // budget path, not an error. The capture must never fail.
        if (ai?.error) ai = null;
      }
    }

    if (!ai) {
      const taskData = { title: rawText };
      if (urls.length) taskData.notes = urls.join('\n');
      const task = await TaskModel.create(taskData, req.user.id);
      return res.json({ task, ai: null, fallback: aiMode !== 'off', aiOff: aiMode === 'off', throttled });
    }

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

    // Resolve project_id from AI's project_name suggestion (exact → includes → fuzzy)
    let projectId = null;
    if (ai.project_name) {
      const aiName = ai.project_name.toLowerCase();
      const match = projects.find(p => p.name.toLowerCase() === aiName)
        || projects.find(p => p.name.toLowerCase().includes(aiName) || aiName.includes(p.name.toLowerCase()));
      if (match) projectId = match.id;
      else console.warn(`Smart capture: AI suggested project "${ai.project_name}" but no match found. Available: ${projects.map(p => p.name).join(', ')}`);
    }

    // Preserve the raw transcript in notes when the input is detailed enough
    // that title compression is likely lossy. Short captures ("buy milk") would
    // just duplicate the title, so skip those. URLs are already inside rawText
    // when it's long, so only fall back to a URL-only notes value for shorts.
    const rawWordCount = rawText.split(/\s+/).filter(Boolean).length;
    let notes = null;
    if (rawWordCount > 8 || rawText.length > 60) notes = rawText;
    else if (urls.length) notes = urls.join('\n');

    // AI-assisted scheduling: find a free slot if requested
    let bookedSlot = null;
    let slotSearchFailed = false;
    if (ai.find_free_slot && ai.due_date && !ai.scheduled_time) {
      const duration = ai.duration || 30;
      try {
        const slot = await findFreeSlot(req.user.id, ai.due_date, duration);
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
      title: ai.title || rawText,
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
    const task = await TaskModel.create(taskData, req.user.id);
    res.json({ task, ai, bookedSlot, slotSearchFailed, routedToInbox });
    syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (smart-capture):', err));
  } catch (error) {
    console.error('Smart capture error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/usage', async (req, res) => {
  try {
    res.json(await getStatus(req.user.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/process-inbox', enforceAiLimit, async (req, res) => {
  try {
    const inboxTasks = await TaskModel.getAll('inbox', req.user.id);
    if (inboxTasks.length === 0) {
      return res.json({ message: 'Inbox is empty', processed_items: [] });
    }

    const [userContexts, allProjects, history] = await Promise.all([
      getUserContexts(req.user.id),
      ProjectModel.getAll(req.user.id),
      getRecentClassifiedTasks(req.user.id, 10),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const result = await processInbox(inboxTasks, userContexts, {
      projects, today: req.today, dayName, history,
    });
    if (aiFailed(res, result)) return;

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
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/daily-priorities', enforceAiLimit, async (req, res) => {
  try {
    const [nextActions, stats] = await Promise.all([
      TaskModel.getAll('next_actions', req.user.id, req.today),
      TaskModel.getStats(req.user.id, req.today),
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

    result.tasks = nextActions;
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
function buildMeetings(dayShape, today) {
  return [
    ...dayShape.gcalEvents
      .filter(e => e.due_date === today && !e.all_day && e.start_time && e.end_time)
      .map(e => ({
        title: e.title,
        start: isoToMinutesOfDay(e.start_time, today),
        end: isoToMinutesOfDay(e.end_time, today),
      })),
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
async function planCandidates(userId, today) {
  const nextActions = await TaskModel.getAll('next_actions', userId, today);
  return nextActions.filter(t => !(t.due_date === today && t.scheduled_time));
}

// The morning brief: the deterministic half of the planning ritual. No AI
// call and no aiLimit — just the shape of the day (free time left, meetings,
// candidates) or, once a plan is applied, its progress. The client renders
// this as the "Plan my day?" banner on first open of the day.
router.get('/day-brief', async (req, res) => {
  try {
    const [dayShape, candidates, planRow] = await Promise.all([
      freeRangesFor(req.user.id, req.today),
      planCandidates(req.user.id, req.today),
      pool.query('SELECT applied_at FROM daily_plans WHERE user_id = $1 AND plan_date = $2', [req.user.id, req.today]),
    ]);
    const free = clampRangesToNow(dayShape.free, minutesNowIn(req.clientTimezone));
    const freeMins = free.reduce((sum, r) => sum + (r.end - r.start), 0);
    const meetings = buildMeetings(dayShape, req.today).length;

    let plan = null;
    const row = planRow.rows[0];
    if (row) {
      const { rows: [blocks] } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE list != 'completed' AND is_daily_focus = true)::int AS remaining,
                COUNT(*) FILTER (WHERE list = 'completed')::int AS done
         FROM tasks
         WHERE user_id = $1 AND due_date = $2 AND scheduled_time IS NOT NULL`,
        [req.user.id, req.today]
      );
      plan = { applied: !!row.applied_at, done: blocks.done, total: blocks.done + blocks.remaining };
    }

    res.json({ date: req.today, freeMins, meetings, candidates: candidates.length, plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// The day planner. Candidates are next actions only — inbox is unclarified,
// waiting_for is blocked on someone else, someday is parked; none belong in a
// time-blocked day. Tasks already time-blocked today are busy ranges, not
// candidates. The AI proposes; packPlan (inside planDay) guarantees the
// result is conflict-free; the user reviews before anything is applied.
router.post('/plan-day', enforceAiLimit, async (req, res) => {
  try {
    await assertPlanWithinLimit(req.user.id, req.today);

    const [allCandidates, dayShape, userContexts] = await Promise.all([
      planCandidates(req.user.id, req.today),
      freeRangesFor(req.user.id, req.today),
      getUserContexts(req.user.id),
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
    const meetings = buildMeetings(dayShape, req.today);

    const { rows: habits } = await pool.query(
      `SELECT h.name, (hl.id IS NOT NULL) AS completed_today
       FROM habits h
       LEFT JOIN habit_logs hl ON hl.habit_id = h.id AND hl.completed_date = $2 AND hl.status = 'done'
       WHERE h.user_id = $1 AND h.active = true
       ORDER BY h.name`,
      [req.user.id, req.today]
    );

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
    }, userContexts);
    if (aiFailed(res, result)) return;

    await pool.query(
      `INSERT INTO daily_plans (user_id, plan_date, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plan_date) DO UPDATE SET payload = $3, created_at = NOW(), applied_at = NULL`,
      [req.user.id, req.today, JSON.stringify(result)]
    );

    result.tasks = candidates;
    res.json(result);
  } catch (error) {
    if (error instanceof LimitError) {
      return res.status(402).json({ error: error.message, code: error.code, resource: error.resource, limit: error.limit });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Applies a reviewed plan: chosen blocks become today's time-blocked focus,
// deferred items move to their new date. Mirrors apply-daily-focus's "clear
// then set" so the plan IS the day's focus list. No AI call → no aiLimit.
router.post('/apply-plan', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const deferred = Array.isArray(req.body.deferred) ? req.body.deferred : [];
    if (items.length === 0 && deferred.length === 0) {
      return res.status(400).json({ error: 'Nothing to apply' });
    }

    const nextActions = await TaskModel.getAll('next_actions', req.user.id, req.today);
    await Promise.all(nextActions.map(task =>
      TaskModel.update(task.id, { is_daily_focus: false }, req.user.id)
    ));

    const updated = [];
    for (const item of items) {
      const task = await TaskModel.update(item.taskId, {
        due_date: req.today,
        scheduled_time: item.start,
        duration: item.duration || 30,
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

    res.json({ applied: updated.length, deferred: deferred.length, tasks: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/import-notes', enforceAiLimit, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/find-duplicates', enforceAiLimit, async (req, res) => {
  try {
    const lists = await Promise.all(
      ['inbox', 'next_actions', 'waiting_for', 'someday_maybe'].map(list =>
        TaskModel.getAll(list, req.user.id, req.today)
      )
    );
    const allTasks = lists.flat();

    if (allTasks.length < 2) {
      return res.json({ duplicate_groups: [], summary: 'Not enough tasks to compare' });
    }

    const userContexts = await getUserContexts(req.user.id);
    const result = await findDuplicates(allTasks, userContexts);
    if (aiFailed(res, result)) return;

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getHabitStats(userId) {
  const [{ rows: habits }, { rows: allLogs }] = await Promise.all([
    pool.query('SELECT * FROM habits WHERE user_id = $1 AND active = true ORDER BY name', [userId]),
    (() => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDate = ninetyDaysAgo.toISOString().split('T')[0];
      return pool.query(
        'SELECT habit_id, completed_date FROM habit_logs WHERE user_id = $1 AND completed_date >= $2',
        [userId, startDate]
      );
    })(),
  ]);

  const today = new Date().toISOString().split('T')[0];
  return {
    habits: habits.map(habit => {
      const logs = allLogs.filter(l => l.habit_id === habit.id);
      const completedDates = new Set(logs.map(l => l.completed_date));
      let streak = 0;
      const d = new Date(today);
      while (true) {
        const dateStr = d.toISOString().split('T')[0];
        if (completedDates.has(dateStr)) { streak++; d.setDate(d.getDate() - 1); }
        else if (dateStr === today) { d.setDate(d.getDate() - 1); }
        else break;
      }
      let expectedDays = 0, completedDays = 0;
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        expectedDays++;
        if (completedDates.has(checkDate.toISOString().split('T')[0])) completedDays++;
      }
      return {
        id: habit.id, name: habit.name, color: habit.color, streak,
        completionRate: expectedDays > 0 ? Math.round((completedDays / expectedDays) * 100) : 0,
        completedLast30: completedDays, expectedLast30: expectedDays,
      };
    })
  };
}

// Not behind enforceAiLimit: this route auto-fires on page mount and must
// serve the review data (lists, stats, habits) even when AI is off or over
// budget — only the analysis itself is gated.
router.post('/weekly-review', async (req, res) => {
  try {
    const userId = req.user.id;
    const aiMode = await getAiMode(userId);
    let aiAllowed = aiMode !== 'off';
    if (aiAllowed) {
      try {
        const status = await consume(userId);
        aiAllowed = status.allowed;
      } catch (err) {
        console.error('weekly-review metering error (failing open):', err);
      }
    }
    const [stats, inboxItems, nextActions, waitingFor, somedayMaybe, projects, staleItems, lastReview, streak, habitStats, userContexts] = await Promise.all([
      TaskModel.getStats(userId, req.today),
      TaskModel.getAll('inbox', userId, req.today),
      TaskModel.getAll('next_actions', userId, req.today),
      TaskModel.getAll('waiting_for', userId, req.today),
      TaskModel.getAll('someday_maybe', userId, req.today),
      ProjectModel.getAll(userId),
      WeeklyReviewModel.getStaleItems(userId),
      WeeklyReviewModel.getLastReview(userId),
      WeeklyReviewModel.getStreak(userId),
      getHabitStats(userId),
      getUserContexts(userId),
    ]);

    const since = lastReview?.completed_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const completedThisWeek = await WeeklyReviewModel.getCompletedTasksSince(userId, since);

    const aiAnalysis = aiAllowed
      ? await weeklyReviewAnalysis({
          stats, nextActions, waitingFor, somedayMaybe, projects,
          staleItems, habitStats, completedThisWeek,
          lastReviewDate: lastReview?.completed_at || null,
        }, userContexts)
      : null;

    res.json({
      stats, inboxItems, nextActions, waitingFor, somedayMaybe,
      projects, habitStats, lastReview, streak, completedThisWeek,
      aiAnalysis: aiAnalysis && !aiAnalysis.error
        ? aiAnalysis
        : { error: aiMode === 'off' ? 'ai_off' : 'AI analysis unavailable' },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
