import { Router } from 'express';
import { TaskModel, ProjectModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { analyzeTask } from '../services/ai.js';
import { enforceAiLimit, requireAiEnabled, chargeAiUsage } from '../middleware/aiLimit.js';
import { getCalendarEvents, syncTaskToCalendar, deleteTaskFromCalendar } from '../services/googleCalendar.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { list } = req.query;
    const tasks = await TaskModel.getAll(list || null, req.user.id, req.today);
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/deferred', async (req, res) => {
  try {
    const { list } = req.query;
    if (!list) return res.status(400).json({ error: 'list query parameter is required' });
    const tasks = await TaskModel.getDeferred(list, req.user.id, req.today);
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await TaskModel.getStats(req.user.id, req.today, req.clientTimezone);
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/daily-focus', async (req, res) => {
  try {
    const tasks = await TaskModel.getDailyFocus(req.user.id, req.today);
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required (YYYY-MM-DD)' });
    }
    const scheduled = await TaskModel.getByDateRange(start, end, req.user.id);
    const unscheduled = await TaskModel.getUnscheduled(req.user.id);

    let googleEvents = [];
    try {
      googleEvents = await getCalendarEvents(req.user.id, start, end, req.clientTimezone);
    } catch (err) {
      console.error('Google Calendar fetch error:', err.message);
    }

    res.json({ scheduled, unscheduled, googleEvents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await TaskModel.getById(req.params.id, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const task = await TaskModel.create(req.body, req.user.id);
    res.status(201).json(task);
    syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (create):', err));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const task = await TaskModel.update(req.params.id, req.body, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
    syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (update):', err));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await TaskModel.getById(req.params.id, req.user.id);
    const eventId = existing?.google_event_id || null;
    // TaskModel.delete handles sequential promotion internally
    await TaskModel.delete(req.params.id, req.user.id);
    res.status(204).send();
    if (eventId) {
      deleteTaskFromCalendar(req.user.id, eventId).catch(err => console.error('deleteTaskFromCalendar:', err));
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const task = await TaskModel.complete(req.params.id, req.user.id, req.today);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
    // For one-shot completion: leave the event as a time log (no action).
    // For recurring tasks: the original task survives with a new due_date — push the move.
    if (task.list !== 'completed' && task.scheduled_time) {
      syncTaskToCalendar(req.user.id, task, req.clientTimezone).catch(err => console.error('syncTaskToCalendar (complete recurring):', err));
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/analyze', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const task = await TaskModel.getById(req.params.id, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const [{ rows: userContexts }, allProjects] = await Promise.all([
      pool.query('SELECT name FROM contexts WHERE user_id = $1 ORDER BY name', [req.user.id]),
      ProjectModel.getAll(req.user.id),
    ]);
    const projects = allProjects.filter(p => p.status === 'active');
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: req.clientTimezone || 'UTC' });
    const analysis = await analyzeTask(task, userContexts, projects, req.today, dayName);
    if (analysis?.error) return res.status(503).json({ error: 'AI is not configured on this server' });
    if (!analysis) return res.status(502).json({ error: 'AI processing failed' });
    await chargeAiUsage(req);
    res.json(analysis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
