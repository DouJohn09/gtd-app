import { Router } from 'express';
import { CustomListModel, ListItemModel } from '../db/models.js';
import { extractUrlMetadata } from '../services/ai.js';

const router = Router();

router.post('/extract-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await extractUrlMetadata(url);
    if (!result) return res.status(422).json({ error: 'Could not extract metadata' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', (req, res) => {
  try {
    res.json(CustomListModel.getAll(req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const list = CustomListModel.getById(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
    res.status(201).json(CustomListModel.create(req.body, req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const list = CustomListModel.update(req.params.id, req.body, req.user.id);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    CustomListModel.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reorder', (req, res) => {
  try {
    res.json(CustomListModel.reorder(req.body.listIds, req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Items

router.get('/:id/items', (req, res) => {
  try {
    res.json(ListItemModel.getByList(req.params.id, req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/items', (req, res) => {
  try {
    if (!req.body.title?.trim()) return res.status(400).json({ error: 'Title is required' });
    res.status(201).json(ListItemModel.create({ ...req.body, list_id: parseInt(req.params.id) }, req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/items/:itemId', (req, res) => {
  try {
    const item = ListItemModel.update(req.params.itemId, req.body, req.user.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/items/:itemId', (req, res) => {
  try {
    ListItemModel.delete(req.params.itemId, req.user.id);
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/items/reorder', (req, res) => {
  try {
    res.json(ListItemModel.reorder(req.params.id, req.body.itemIds, req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/items/:itemId/promote', (req, res) => {
  try {
    const result = ListItemModel.promoteToTask(req.params.itemId, req.user.id);
    if (!result) return res.status(404).json({ error: 'Item not found' });
    if (result.alreadyLinked) return res.status(409).json({ error: 'Item already linked to a task' });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
