import { Router } from 'express';
import { TaskModel, ProjectModel, WeeklyReviewModel } from '../db/models.js';
import { getDb } from '../db/schema.js';
import { processInbox, getDailyPriorities, importNotes, findDuplicates, weeklyReviewAnalysis, smartCapture } from '../services/ai.js';
import { syncTaskToCalendar } from '../services/googleCalendar.js';

function getUserContexts(userId) {
  const db = getDb();
  const stmt = db.prepare('SELECT name FROM contexts WHERE user_id = ? ORDER BY name');
  stmt.bind([userId]);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
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
    const contexts = getUserContexts(req.user.id);
    const projects = ProjectModel.getAll(req.user.id).filter(p => p.status === 'active');
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const ai = await smartCapture(rawText, contexts, projects, today, dayName);

    if (!ai) {
      const taskData = { title: rawText };
      if (urls.length) taskData.notes = urls.join('\n');
      const task = TaskModel.create(taskData, req.user.id);
      return res.json({ task, ai: null, fallback: true });
    }

    // Resolve project_id from AI's project_name suggestion
    let projectId = null;
    if (ai.project_name) {
      const match = projects.find(p => p.name.toLowerCase() === ai.project_name.toLowerCase());
      if (match) projectId = match.id;
    }

    let notes = null;
    if (urls.length) notes = urls.join('\n');

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
      is_daily_focus: ai.is_daily_focus ? 1 : 0,
      waiting_for_person: ai.waiting_for_person || null,
      recurrence_rule: ai.recurrence_rule || null,
      recurrence_interval: ai.recurrence_interval || null,
      recurrence_days: ai.recurrence_days || null,
    };
    const task = TaskModel.create(taskData, req.user.id);
    res.json({ task, ai });
    syncTaskToCalendar(req.user.id, task).catch(err => console.error('syncTaskToCalendar (smart-capture):', err));
  } catch (error) {
    console.error('Smart capture error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/process-inbox', async (req, res) => {
  try {
    const inboxTasks = TaskModel.getAll('inbox', req.user.id);
    if (inboxTasks.length === 0) {
      return res.json({ message: 'Inbox is empty', processed_items: [] });
    }

    const userContexts = getUserContexts(req.user.id);
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

    const updatedTasks = items.map(item => {
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
      if (item.is_daily_focus !== undefined) updates.is_daily_focus = item.is_daily_focus ? 1 : 0;
      if (item.waiting_for_person !== undefined) updates.waiting_for_person = item.waiting_for_person || null;
      return TaskModel.update(item.task_id, updates, req.user.id);
    });

    res.json(updatedTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-priorities', async (req, res) => {
  try {
    const nextActions = TaskModel.getAll('next_actions', req.user.id);
    const stats = TaskModel.getStats(req.user.id);

    if (nextActions.length === 0) {
      return res.json({
        message: 'No next actions available',
        suggested_focus: [],
        productivity_tip: 'Process your inbox to identify next actions!'
      });
    }

    const userContexts = getUserContexts(req.user.id);
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

    const userContexts = getUserContexts(req.user.id);
    const projects = ProjectModel.getAll(req.user.id).filter(p => p.status === 'active');
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const result = await importNotes(text, userContexts, projects, today, dayName);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

    // Resolve project_name → project_id for each item
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

    const created = items.map(item => {
      return TaskModel.create({
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
        is_daily_focus: item.is_daily_focus ? 1 : 0,
      }, req.user.id);
    });

    res.json({ count: created.length, tasks: created });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/apply-daily-focus', async (req, res) => {
  try {
    const { taskIds } = req.body;

    TaskModel.getAll('next_actions', req.user.id).forEach(task => {
      TaskModel.update(task.id, { is_daily_focus: 0 }, req.user.id);
    });

    const updatedTasks = taskIds.map(id =>
      TaskModel.update(id, { is_daily_focus: 1 }, req.user.id)
    );

    res.json(updatedTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/find-duplicates', async (req, res) => {
  try {
    const allTasks = ['inbox', 'next_actions', 'waiting_for', 'someday_maybe']
      .flatMap(list => TaskModel.getAll(list, req.user.id));

    if (allTasks.length < 2) {
      return res.json({ duplicate_groups: [], summary: 'Not enough tasks to compare' });
    }

    const userContexts = getUserContexts(req.user.id);
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

    taskIds.forEach(id => TaskModel.delete(id, req.user.id));
    res.json({ count: taskIds.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to query habit stats (reused from habits route pattern)
function getHabitStats(userId) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY name');
  stmt.bind([userId]);
  const habits = [];
  while (stmt.step()) habits.push(stmt.getAsObject());
  stmt.free();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split('T')[0];
  const logStmt = db.prepare('SELECT habit_id, completed_date FROM habit_logs WHERE user_id = ? AND completed_date >= ?');
  logStmt.bind([userId, startDate]);
  const allLogs = [];
  while (logStmt.step()) allLogs.push(logStmt.getAsObject());
  logStmt.free();

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
    const stats = TaskModel.getStats(userId);
    const inboxItems = TaskModel.getAll('inbox', userId);
    const nextActions = TaskModel.getAll('next_actions', userId);
    const waitingFor = TaskModel.getAll('waiting_for', userId);
    const somedayMaybe = TaskModel.getAll('someday_maybe', userId);
    const projects = ProjectModel.getAll(userId);
    const staleItems = WeeklyReviewModel.getStaleItems(userId);
    const lastReview = WeeklyReviewModel.getLastReview(userId);
    const streak = WeeklyReviewModel.getStreak(userId);
    const habitStats = getHabitStats(userId);
    const userContexts = getUserContexts(userId);

    const since = lastReview?.completed_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const completedThisWeek = WeeklyReviewModel.getCompletedTasksSince(userId, since);

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

    tasksCompleted.forEach(id => TaskModel.complete(id, userId));
    tasksDeleted.forEach(id => TaskModel.delete(id, userId));
    tasksMoved.forEach(({ id, toList }) => TaskModel.update(id, { list: toList }, userId));

    const review = WeeklyReviewModel.create({
      inboxCountAtStart,
      tasksCompleted: tasksCompleted.length,
      tasksMoved: tasksMoved.length,
      tasksDeleted: tasksDeleted.length,
      aiSummary,
    }, userId);

    const streak = WeeklyReviewModel.getStreak(userId);
    res.json({ review, streak });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
