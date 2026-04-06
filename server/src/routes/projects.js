import { Router } from 'express';
import { ProjectModel, TaskModel } from '../db/models.js';
import { suggestProjectBreakdown } from '../services/ai.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const projects = ProjectModel.getAll();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const project = ProjectModel.getById(req.params.id);
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
    const project = ProjectModel.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const project = ProjectModel.update(req.params.id, req.body);
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
    ProjectModel.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/breakdown', async (req, res) => {
  try {
    const project = ProjectModel.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const breakdown = await suggestProjectBreakdown(project);
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
      })
    );
    
    res.json(createdTasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
