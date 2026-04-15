import express from "express";
import { pool } from "../db/index.js";
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";

const router = express.Router();

/**
 * 🧩 POST /api/v1/device/context/build
 * Monta bloco de contexto com base nas memórias mais relevantes
 */
router.post("/context/build", async (req, res) => {
  try {
    const { user_id, query, limit = 5 } = req.body;

    if (!user_id || !query) {
      return res.status(400).json({ error: "Missing user_id or query" });
    }

    // 1️⃣ Gera embedding da query
    const queryEmbedding = await generateEmbedding(query);

    // 2️⃣ Busca memórias do usuário
    const { rows: memories } = await pool.query(
      `SELECT id, content, summary, embedding
       FROM memories
       WHERE user_id = $1`,
      [user_id]
    );

    if (memories.length === 0) {
      return res.json({ status: "ok", message: "Nenhuma memória encontrada." });
    }

    // 3️⃣ Calcula similaridades
    const scored = memories
      .filter((m) => m.embedding)
      .map((m) => {
        let embeddingVector;
        try {
          embeddingVector = Array.isArray(m.embedding)
            ? m.embedding
            : JSON.parse(m.embedding);
        } catch {
          return null;
        }

        if (!Array.isArray(embeddingVector)) return null;

        const similarity = cosineSimilarity(queryEmbedding, embeddingVector);
        return { id: m.id, summary: m.summary, content: m.content, similarity };
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (scored.length === 0) {
      return res.json({ status: "ok", message: "Nenhuma memória relevante encontrada." });
    }

    // 4️⃣ Monta o bloco de contexto textual
    const contextBlock = scored
      .map((m, idx) => `(${idx + 1}) ${m.summary || m.content}`)
      .join("\n");

    res.json({
      status: "ok",
      query,
      memories_used: scored.map((m) => m.id),
      context_block: contextBlock,
    });
  } catch (err) {
    console.error("❌ Error building context:", err);
    res.status(500).json({ error: "Context build failed", details: err.message });
  }
});

export default router;
