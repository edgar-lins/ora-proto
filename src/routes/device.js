import express from 'express';
import { pool } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// POST /api/v1/device/event
router.post('/event', async (req, res) => {
  try {
    const { user_id, content, metadata } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({ error: 'Missing user_id or content' });
    }

    const summary = content.length > 120 ? content.slice(0, 120) + '...' : content;

    const id = uuidv4();

    await pool.query(
      `INSERT INTO memories (id, user_id, content, summary, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, user_id, content, summary, metadata || {}]
    );

    res.json({ status: 'ok', memory_id: id, summary });
  } catch (err) {
    console.error('Error saving memory:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
