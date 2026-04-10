import { Router } from 'express';
import { TaskModel } from '../db/models.js';
import { processInbox, getDailyPriorities } from '../services/ai.js';

const router = Router();

router.post('/process-inbox', async (req, res) => {
  try {
    const inboxTasks = TaskModel.getAll('inbox', req.user.id);
    if (inboxTasks.length === 0) {
      return res.json({ message: 'Inbox is empty', processed_items: [] });
    }

    const result = await processInbox(inboxTasks);
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
        priority: item.priority
      };
      if (item.suggested_title) {
        updates.title = item.suggested_title;
      }
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

    const result = await getDailyPriorities(nextActions, stats);
    if (!result) {
      return res.status(500).json({ error: 'AI processing failed' });
    }

    result.tasks = nextActions;
    res.json(result);
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

export default router;
