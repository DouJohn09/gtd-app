import { Router } from 'express';
import { ProjectModel, TaskModel } from '../db/models.js';
import { getDb } from '../db/schema.js';
import { suggestProjectBreakdown } from '../services/ai.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const projects = ProjectModel.getAll(req.user.id);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const project = ProjectModel.getById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const project = ProjectModel.create(req.body, req.user.id);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const project = ProjectModel.update(req.params.id, req.body, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    ProjectModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/breakdown', async (req, res) => {
  try {
    const project = ProjectModel.getById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const db = getDb();
    const ctxStmt = db.prepare('SELECT name FROM contexts WHERE user_id = ? ORDER BY name');
    ctxStmt.bind([req.user.id]);
    const userContexts = [];
    while (ctxStmt.step()) userContexts.push(ctxStmt.getAsObject());
    ctxStmt.free();

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

    const createdTasks = tasks.map(task =>
      TaskModel.create({
        ...task,
        project_id: projectId,
        list: 'next_actions'
      }, req.user.id)
    );

    res.json(createdTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
