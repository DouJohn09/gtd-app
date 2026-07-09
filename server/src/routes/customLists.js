import { Router } from 'express';
import { CustomListModel, ListItemModel } from '../db/models.js';
import { extractUrlMetadata } from '../services/ai.js';
import { enforceAiLimit, requireAiEnabled, chargeAiUsage } from '../middleware/aiLimit.js';
import { aiRateLimiter } from '../middleware/rateLimit.js';
import { assertWithinLimit, LimitError } from '../services/billing.js';

const router = Router();

router.post('/extract-url', aiRateLimiter, requireAiEnabled, enforceAiLimit, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await extractUrlMetadata(url);
    if (!result) return res.status(422).json({ error: 'Could not extract metadata' });
    await chargeAiUsage(req);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/', async (req, res) => {
  try {
    res.json(await CustomListModel.getAll(req.user.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const list = await CustomListModel.getById(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
    await assertWithinLimit(req.user.id, 'custom_lists');
    res.status(201).json(await CustomListModel.create(req.body, req.user.id));
  } catch (err) {
    if (err instanceof LimitError) {
      return res.status(402).json({ error: err.message, code: err.code, resource: err.resource, limit: err.limit });
    }
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const list = await CustomListModel.update(req.params.id, req.body, req.user.id);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await CustomListModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/reorder', async (req, res) => {
  try {
    res.json(await CustomListModel.reorder(req.body.listIds, req.user.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// Items

router.get('/:id/items', async (req, res) => {
  try {
    res.json(await ListItemModel.getByList(req.params.id, req.user.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/:id/items', async (req, res) => {
  try {
    if (!req.body.title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const item = await ListItemModel.create({ ...req.body, list_id: parseInt(req.params.id) }, req.user.id);
    if (!item) return res.status(404).json({ error: 'List not found' });
    res.status(201).json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const item = await ListItemModel.update(req.params.itemId, req.body, req.user.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    await ListItemModel.delete(req.params.itemId, req.user.id);
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/:id/items/reorder', async (req, res) => {
  try {
    res.json(await ListItemModel.reorder(req.params.id, req.body.itemIds, req.user.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/:id/items/:itemId/promote', async (req, res) => {
  try {
    const result = await ListItemModel.promoteToTask(req.params.itemId, req.user.id);
    if (!result) return res.status(404).json({ error: 'Item not found' });
    if (result.alreadyLinked) return res.status(409).json({ error: 'Item already linked to a task' });
    res.status(201).json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
