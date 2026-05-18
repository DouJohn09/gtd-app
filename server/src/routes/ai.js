import { Router } from 'express';
import { TaskModel, ProjectModel, WeeklyReviewModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { processInbox, getDailyPriorities, importNotes, findDuplicates, weeklyReviewAnalysis, smartCapture } from '../services/ai.js';
import { syncTaskToCalendar } from '../services/googleCalendar.js';
import { findFreeSlot } from '../services/scheduling.js';

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

const router = Router();

router.post('/smart-capture', async (req, res) => {
  try {
    const { text, routing } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const rawText = text.trim();
    const urls = rawText.match(/https?:\/\/[^\s]+/gi) || [];
    const [contexts, allProjects, history] = await Promise.all([
      getUserContexts(req.user.id),
      ProjectModel.getAll(req.user.id),
      getRecentClassifiedTasks(req.user.id, 10),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const ai = await smartCapture(rawText, contexts, projects, today, dayName, history);

    if (!ai) {
      const taskData = { title: rawText };
      if (urls.length) taskData.notes = urls.join('\n');
      const task = await TaskModel.create(taskData, req.user.id);
      return res.json({ task, ai: null, fallback: true });
    }

    // Confidence-gated routing: trust AI's list when confident, fall back to
    // inbox when ambiguous (or when user opted into always-inbox mode).
    // All other AI parsing (context, due date, project, etc.) is preserved
    // regardless — the inbox becomes a triage holding bay with metadata
    // pre-filled, not a re-do from scratch.
    let routedToInbox = false;
    if (routing === 'always_inbox' && ai.list !== 'inbox') {
      ai.list = 'inbox';
      routedToInbox = true;
    } else if (routing !== 'always_inbox' && ai.list_confidence === 'low' && ai.list !== 'inbox') {
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/process-inbox', async (req, res) => {
  try {
    const inboxTasks = await TaskModel.getAll('inbox', req.user.id);
    if (inboxTasks.length === 0) {
      return res.json({ message: 'Inbox is empty', processed_items: [] });
    }

    const userContexts = await getUserContexts(req.user.id);
    const result = await processInbox(inboxTasks, userContexts);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

    result.tasks = inboxTasks;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-priorities', async (req, res) => {
  try {
    const [nextActions, stats] = await Promise.all([
      TaskModel.getAll('next_actions', req.user.id),
      TaskModel.getStats(req.user.id),
    ]);

    if (nextActions.length === 0) {
      return res.json({
        message: 'No next actions available',
        suggested_focus: [],
        productivity_tip: 'Process your inbox to identify next actions!'
      });
    }

    const userContexts = await getUserContexts(req.user.id);
    const result = await getDailyPriorities(nextActions, stats, userContexts);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

    result.tasks = nextActions;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import-notes', async (req, res) => {
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
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const result = await importNotes(text, userContexts, projects, today, dayName);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/apply-daily-focus', async (req, res) => {
  try {
    const { taskIds } = req.body;

    // Clear daily focus on all current next-actions, then set on the chosen ones.
    // Could be done as two SQL statements directly but going through TaskModel
    // keeps the auto-promotion + updated_at semantics consistent.
    const nextActions = await TaskModel.getAll('next_actions', req.user.id);
    await Promise.all(nextActions.map(task =>
      TaskModel.update(task.id, { is_daily_focus: false }, req.user.id)
    ));

    const updatedTasks = await Promise.all(taskIds.map(id =>
      TaskModel.update(id, { is_daily_focus: true }, req.user.id)
    ));

    res.json(updatedTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/find-duplicates', async (req, res) => {
  try {
    const lists = await Promise.all(
      ['inbox', 'next_actions', 'waiting_for', 'someday_maybe'].map(list =>
        TaskModel.getAll(list, req.user.id)
      )
    );
    const allTasks = lists.flat();

    if (allTasks.length < 2) {
      return res.json({ duplicate_groups: [], summary: 'Not enough tasks to compare' });
    }

    const userContexts = await getUserContexts(req.user.id);
    const result = await findDuplicates(allTasks, userContexts);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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

router.post('/weekly-review', async (req, res) => {
  try {
    const userId = req.user.id;
    const [stats, inboxItems, nextActions, waitingFor, somedayMaybe, projects, staleItems, lastReview, streak, habitStats, userContexts] = await Promise.all([
      TaskModel.getStats(userId),
      TaskModel.getAll('inbox', userId),
      TaskModel.getAll('next_actions', userId),
      TaskModel.getAll('waiting_for', userId),
      TaskModel.getAll('someday_maybe', userId),
      ProjectModel.getAll(userId),
      WeeklyReviewModel.getStaleItems(userId),
      WeeklyReviewModel.getLastReview(userId),
      WeeklyReviewModel.getStreak(userId),
      getHabitStats(userId),
      getUserContexts(userId),
    ]);

    const since = lastReview?.completed_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const completedThisWeek = await WeeklyReviewModel.getCompletedTasksSince(userId, since);

    const aiAnalysis = await weeklyReviewAnalysis({
      stats, nextActions, waitingFor, somedayMaybe, projects,
      staleItems, habitStats, completedThisWeek,
      lastReviewDate: lastReview?.completed_at || null,
    }, userContexts);

    res.json({
      stats, inboxItems, nextActions, waitingFor, somedayMaybe,
      projects, habitStats, lastReview, streak, completedThisWeek,
      aiAnalysis: aiAnalysis || { error: 'AI analysis unavailable' },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
