import { Router } from 'express';
import { ProjectModel, TaskModel } from '../db/models.js';
import { pool } from '../db/pool.js';
import { suggestProjectBreakdown } from '../services/ai.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const projects = await ProjectModel.getAll(req.user.id);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const project = await ProjectModel.create(req.body, req.user.id);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ProjectModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/breakdown', async (req, res) => {
  try {
    const project = await ProjectModel.getById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { rows: userContexts } = await pool.query(
      'SELECT name FROM contexts WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    const breakdown = await suggestProjectBreakdown(project, userContexts);
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
