import { Router } from 'express';
import { TaskModel } from '../db/models.js';
import { getDb } from '../db/schema.js';
import { analyzeTask } from '../services/ai.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const { list } = req.query;
    const tasks = TaskModel.getAll(list || null, req.user.id);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = TaskModel.getStats(req.user.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/daily-focus', (req, res) => {
  try {
    const tasks = TaskModel.getDailyFocus(req.user.id);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/calendar', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required (YYYY-MM-DD)' });
    }
    const scheduled = TaskModel.getByDateRange(start, end, req.user.id);
    const unscheduled = TaskModel.getUnscheduled(req.user.id);
    res.json({ scheduled, unscheduled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const task = TaskModel.getById(req.params.id, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const task = TaskModel.create(req.body, req.user.id);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const task = TaskModel.update(req.params.id, req.body, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    // TaskModel.delete handles sequential promotion internally
    TaskModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/complete', (req, res) => {
  try {
    const task = TaskModel.complete(req.params.id, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/analyze', async (req, res) => {
  try {
    const task = TaskModel.getById(req.params.id, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const db = getDb();
    const ctxStmt = db.prepare('SELECT name FROM contexts WHERE user_id = ? ORDER BY name');
    ctxStmt.bind([req.user.id]);
    const userContexts = [];
    while (ctxStmt.step()) userContexts.push(ctxStmt.getAsObject());
    ctxStmt.free();

    const analysis = await analyzeTask(task, userContexts);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
