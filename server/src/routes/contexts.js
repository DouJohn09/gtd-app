import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM contexts WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    let { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Context name is required' });
    }
    name = name.trim();
    if (!name.startsWith('@')) {
      name = '@' + name;
    }

    const { rows } = await pool.query(
      'INSERT INTO contexts (name, user_id) VALUES ($1, $2) RETURNING id',
      [name, req.user.id]
    );
    res.status(201).json({ id: rows[0].id, name, user_id: req.user.id });
  } catch (error) {
    // PG unique violation: code '23505'
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Context already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM contexts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
