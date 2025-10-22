import express from 'express';
import { pool } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Função para gerar o embedding (vetor semântico)
async function generateEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Embedding API error:', data);
    throw new Error(data.error?.message || 'Failed to generate embedding');
  }

  return data.data[0].embedding;
}

// Endpoint principal
router.post('/event', async (req, res) => {
  try {
    const { user_id, content, metadata } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({ error: 'Missing user_id or content' });
    }

    const summary = content.length > 120 ? content.slice(0, 120) + '...' : content;
    const id = uuidv4();

    // Gera o vetor semântico
    const embedding = await generateEmbedding(content);
    if (!embedding || !Array.isArray(embedding)) {
        throw new Error("Failed to generate valid embedding for content");
    }


    // Salva no banco
    await pool.query(
      `INSERT INTO memories (id, user_id, content, summary, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, user_id, content, summary, metadata || {}, JSON.stringify(embedding)]
    );

    res.json({ status: 'ok', memory_id: id, summary });
  } catch (err) {
    console.error('Error saving memory:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router;
