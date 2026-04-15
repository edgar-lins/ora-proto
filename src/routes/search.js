import express from "express";
import { pool } from "../db/index.js";
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";

const router = express.Router();

// Rota de busca semântica
router.post("/search", async (req, res) => {
  try {
    const { user_id, query } = req.body;
    if (!user_id || !query) {
      return res.status(400).json({ error: "Missing user_id or query" });
    }

    // Gera o embedding da consulta
    const queryEmbedding = await generateEmbedding(query);

    // Busca todas as memórias do usuário
    const result = await pool.query(
      "SELECT id, content, embedding FROM memories WHERE user_id = $1",
      [user_id]
    );

    // Calcula similaridade de cosseno entre a consulta e cada memória
    const validMemories = result.rows.filter(row => Array.isArray(row.embedding));

    if (validMemories.length === 0) {
      return res.status(404).json({ message: "No valid memories with embeddings found." });
    }

    const scored = validMemories.map((row) => ({
      id: row.id,
      content: row.content,
      similarity: cosineSimilarity(queryEmbedding, row.embedding),
    }));

    // Ordena do mais semelhante pro menos
    scored.sort((a, b) => b.similarity - a.similarity);

    res.json({
      query,
      top_results: scored.slice(0, 5), // retorna só os 5 mais relevantes
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

export default router;
