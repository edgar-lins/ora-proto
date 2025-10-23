import express from "express";
import fetch from "node-fetch";
import OpenAI from "openai";
import { pool } from "../db/index.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Gera embedding da query
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
  if (!res.ok) throw new Error(data.error?.message || "Failed to generate embedding");
  return data.data[0].embedding;
}

/**
 * Similaridade de cosseno
 */
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

/**
 * POST /api/v1/device/context/respond
 * Usa o contexto de memória pra responder perguntas de forma natural
 */
router.post("/context/respond", async (req, res) => {
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
      return res.json({
        status: "ok",
        message: "Nenhuma memória relevante encontrada para responder.",
      });
    }

    // 4️⃣ Monta o bloco de contexto
    const contextBlock = scored
      .map((m, idx) => `(${idx + 1}) ${m.summary || m.content}`)
      .join("\n");

    // 5️⃣ Gera resposta com GPT
    const prompt = `
Você é o ORA, um assistente pessoal que responde com base nas memórias do usuário.
Use apenas as informações do contexto abaixo para responder de forma direta e natural.

Contexto:
${contextBlock}

Pergunta do usuário: ${query}

Responda de forma clara e concisa, como se lembrasse do fato.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 150,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    // 6️⃣ Retorna a resposta final
    res.json({
      status: "ok",
      query,
      answer,
      context_used: contextBlock,
    });
  } catch (err) {
    console.error("❌ Error generating contextual response:", err);
    res.status(500).json({
      error: "Context response failed",
      details: err.message,
    });
  }
});

export default router;
