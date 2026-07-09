import { Router } from 'express';
import { ProjectModel, TaskModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { suggestProjectBreakdown } from '../services/ai.js';
import { enforceAiLimit, requireAiEnabled, chargeAiUsage } from '../middleware/aiLimit.js';
import { assertWithinLimit, LimitError } from '../services/billing.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const projects = await ProjectModel.getAll(req.user.id);
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await ProjectModel.getById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    await assertWithinLimit(req.user.id, 'projects');
    const project = await ProjectModel.create(req.body, req.user.id);
    res.status(201).json(project);
  } catch (error) {
    if (error instanceof LimitError) {
      return res.status(402).json({ error: error.message, code: error.code, resource: error.resource, limit: error.limit });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const project = await ProjectModel.update(req.params.id, req.body, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ProjectModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/breakdown', requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const project = await ProjectModel.getById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const [{ rows: userContexts }, { rows: existingTasks }] = await Promise.all([
      pool.query('SELECT name FROM contexts WHERE user_id = $1 ORDER BY name', [req.user.id]),
      pool.query(
        'SELECT title, list FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY created_at',
        [req.params.id, req.user.id]
      ),
    ]);
    const breakdown = await suggestProjectBreakdown(project, userContexts, existingTasks);
    if (breakdown?.error) return res.status(503).json({ error: 'AI is not configured on this server' });
    if (!breakdown) return res.status(502).json({ error: 'AI processing failed' });
    await chargeAiUsage(req);
    res.json(breakdown);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/apply-breakdown', async (req, res) => {
  try {
    const { tasks } = req.body;
    const projectId = req.params.id;

    const createdTasks = await Promise.all(
      tasks.map((task, index) =>
        TaskModel.create({
          ...task,
          project_id: projectId,
          list: 'next_actions',
          position: task.order ?? index,
        }, req.user.id)
      )
    );

    res.json(createdTasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reorder', async (req, res) => {
  try {
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: 'taskIds must be an array' });
    }
    const tasks = await TaskModel.reorderTasks(req.params.id, taskIds, req.user.id);
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
