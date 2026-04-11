import { Router } from 'express';
import { getDb, saveDb } from '../db/schema.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM contexts WHERE user_id = ? ORDER BY name');
    stmt.bind([req.user.id]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    let { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Context name is required' });
    }
    name = name.trim();
    if (!name.startsWith('@')) {
      name = '@' + name;
    }

    const db = getDb();
    db.run('INSERT INTO contexts (name, user_id) VALUES (?, ?)', [name, req.user.id]);
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    saveDb();

    res.status(201).json({ id, name, user_id: req.user.id });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Context already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM contexts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    saveDb();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
