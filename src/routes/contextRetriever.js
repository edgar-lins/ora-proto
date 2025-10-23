import express from "express";
import { pool } from "../db/index.js";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

/**
 * Gera embedding para a query
 */
async function generateEmbedding(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Embedding API error:", data);
    throw new Error(data.error?.message || "Failed to generate embedding");
  }

  return data.data[0].embedding;
}

/**
 * Calcula similaridade de cosseno entre dois vetores
 */
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

/**
 * 🧠 POST /api/v1/device/context/retrieve
 * Busca memórias mais relevantes pelo vetor semântico
 */
router.post("/context/retrieve", async (req, res) => {
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

    // 3️⃣ Calcula similaridade de cosseno entre query e cada embedding
    const scored = memories
    .filter(m => m.embedding) // ✅ ignora memórias nulas
    .map((m) => {
        let embeddingVector;
        try {
        embeddingVector = Array.isArray(m.embedding)
            ? m.embedding
            : JSON.parse(m.embedding);
        } catch {
        console.warn(`⚠️ Embedding inválido ignorado para memória ${m.id}`);
        return null;
        }

        if (!Array.isArray(embeddingVector)) return null;

        const similarity = cosineSimilarity(queryEmbedding, embeddingVector);
        return {
        id: m.id,
        summary: m.summary,
        content: m.content,
        similarity,
        };
    })
    .filter(Boolean) // remove nulos do resultado
    .sort((a, b) => b.similarity - a.similarity);


    // 4️⃣ Ordena pelas mais semelhantes
    scored.sort((a, b) => b.similarity - a.similarity);

    // 5️⃣ Retorna top N resultados
    const topResults = scored.slice(0, limit);

    res.json({ status: "ok", query, results: topResults });
  } catch (err) {
    console.error("❌ Error retrieving context:", err);
    res.status(500).json({ error: "Context retrieval failed", details: err.message });
  }
});

export default router;
