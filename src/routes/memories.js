import express from "express";
import { pool } from "../db/index.js";
import OpenAI from "openai";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🔧 Gera embedding
 */
async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * 🔢 Similaridade de cosseno
 */
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

/**
 * 📋 GET /api/v1/device/memories/list/:user_id
 * Lista as memórias de um usuário (limite 50)
 */
router.get("/device/memories/list/:user_id", async (req, res) => {
  const { user_id } = req.params;

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    const { rows } = await pool.query(
      `SELECT id, summary, content, tags, created_at
       FROM memories
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user_id]
    );

    res.json({ status: "ok", memories: rows });
  } catch (err) {
    console.error("❌ Erro ao listar memórias:", err);
    res.status(500).json({ error: "Memory listing failed", details: err.message });
  }
});

/**
 * 🔍 POST /api/v1/device/memories/search
 * Busca semântica nas memórias do usuário
 */
router.post("/device/memories/search", async (req, res) => {
  const { user_id, query } = req.body;
  if (!user_id || !query) return res.status(400).json({ error: "Missing user_id or query" });

  try {
    const embedding = await generateEmbedding(query);
    const { rows } = await pool.query(
      `SELECT id, summary, content, tags, embedding
       FROM memories
       WHERE user_id = $1`,
      [user_id]
    );

    const results = rows
      .filter((r) => r.embedding)
      .map((r) => {
        const emb = Array.isArray(r.embedding) ? r.embedding : JSON.parse(r.embedding);
        const score = cosineSimilarity(embedding, emb);
        return { ...r, similarity: score };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    res.json({ status: "ok", results });
  } catch (err) {
    console.error("❌ Erro na busca semântica:", err);
    res.status(500).json({ error: "Semantic search failed", details: err.message });
  }
});

/**
 * 🗑 DELETE /api/v1/device/memories/:id
 * Remove uma memória específica
 */
router.delete("/device/memories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM memories WHERE id = $1", [id]);
    res.json({ status: "ok", deleted_id: id });
  } catch (err) {
    console.error("❌ Erro ao deletar memória:", err);
    res.status(500).json({ error: "Memory deletion failed", details: err.message });
  }
});

export default router;
