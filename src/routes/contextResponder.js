import express from "express";
import fetch from "node-fetch";
import OpenAI from "openai";
import { pool } from "../db/index.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔒 Limiar mínimo de confiança para usar contexto
const SIMILARITY_MIN = 0.35;

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
 * Usa o contexto + histórico de conversa pra responder de forma natural e segura
 */
router.post("/context/respond", async (req, res) => {
  try {
    const { user_id, query, limit = 5 } = req.body;
    if (!user_id || !query) {
      return res.status(400).json({ error: "Missing user_id or query" });
    }

    // 1️⃣ Gera embedding da query
    const queryEmbedding = await generateEmbedding(query);

    // 2️⃣ Busca memórias semânticas do usuário
    const { rows: memories } = await pool.query(
      `SELECT id, content, summary, embedding, created_at
       FROM memories
       WHERE user_id = $1`,
      [user_id]
    );

    const scored = memories
      .filter((m) => m.embedding)
      .map((m) => {
        let emb;
        try {
          emb = Array.isArray(m.embedding) ? m.embedding : JSON.parse(m.embedding);
        } catch {
          return null;
        }
        if (!Array.isArray(emb)) return null;

        const similarity = cosineSimilarity(queryEmbedding, emb);
        return { id: m.id, summary: m.summary, content: m.content, similarity };
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    const topSim = scored[0]?.similarity ?? 0;

    // 🔒 Evita respostas “chutadas” se o contexto for fraco
    if (topSim < SIMILARITY_MIN) {
      return res.json({
        status: "ok",
        query,
        answer:
          "Não encontrei detalhes confiáveis nas minhas memórias para afirmar isso. Pode me lembrar rapidinho do que se trata?",
        context_used: "",
        conversation_used: [],
      });
    }

    const contextBlock = scored
      .map((m, i) => `(${i + 1}) ${m.summary || m.content}`)
      .join("\n");

    // 3️⃣ Busca histórico recente
    const { rows: recentHistory } = await pool.query(
      `SELECT role, content
       FROM conversation_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [user_id]
    );

    const conversationHistory = recentHistory.reverse().map((r) => ({
      role: r.role,
      content: r.content,
    }));

    // 4️⃣ Monta prompt com guardrails anti-alucinação
    const systemPrompt = {
      role: "system",
      content: `
Você é o ORA — um assistente pessoal empático e natural.
Regras de ouro:
- Use apenas fatos presentes no "Contexto de memória".
- NÃO invente datas, nomes, horários ou números. Se o dado não estiver no contexto, diga "não consta nas minhas memórias".
- Prefira repetir o formato do contexto (ex: "sexta-feira"), sem criar novas datas.
- Seja claro e direto; evite termos como "caro usuário" ou "big day".
- Responda em 1–2 frases, de forma humana e leve.

Contexto de memória:
${contextBlock}
`.trim(),
    };

    const messages = [
      systemPrompt,
      ...conversationHistory,
      { role: "user", content: query },
    ];

    // 5️⃣ Gera resposta com GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.5,
      max_tokens: 180,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    // 6️⃣ Salva no histórico
    await pool.query(
      `INSERT INTO conversation_history (id, user_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, 'user', $2, NOW()),
              (gen_random_uuid(), $1, 'assistant', $3, NOW())`,
      [user_id, query, answer]
    );

    res.json({
      status: "ok",
      query,
      answer,
      context_used: contextBlock,
      conversation_used: conversationHistory,
    });
  } catch (err) {
    console.error("❌ Context respond (guardrails) error:", err);
    res.status(500).json({
      error: "Context response with conversation failed",
      details: err.message,
    });
  }
});

export default router;
