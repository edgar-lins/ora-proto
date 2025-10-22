import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { pool } from "../db/index.js";
import { cosineSimilarity } from "../utils/math.js"; // criaremos esse helper rapidinho
import { v4 as uuid } from "uuid";

dotenv.config();
const router = express.Router();

async function generateEmbedding(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message);
  return data.data[0].embedding;
}

// Função auxiliar pra gerar a resposta natural com o GPT
async function generateResponse(query, context) {
  const messages = [
    {
      role: "system",
      content:
        "Você é o ORA, um assistente pessoal que ajuda o usuário a lembrar o que fez. Responda de forma breve, natural e em português, usando as informações abaixo como contexto.",
    },
    {
      role: "user",
      content: `Pergunta: ${query}\n\nMemórias relevantes:\n${context}`,
    },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.6,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message);
  return data.choices[0].message.content.trim();
}

// Rota principal
router.post("/respond", async (req, res) => {
  try {
    const { user_id, query } = req.body;
    if (!user_id || !query) {
      return res.status(400).json({ error: "Missing user_id or query" });
    }

    // 1️⃣ Gera o embedding da pergunta
    const queryEmbedding = await generateEmbedding(query);

    // 2️⃣ Busca memórias do usuário
    const result = await pool.query(
      "SELECT id, content, embedding FROM memories WHERE user_id = $1",
      [user_id]
    );

    const validMemories = result.rows.filter(row => Array.isArray(row.embedding));

    // 3️⃣ Calcula similaridade e seleciona as mais relevantes
    const scored = validMemories
      .map((row) => ({
        id: row.id,
        content: row.content,
        similarity: cosineSimilarity(queryEmbedding, row.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    const context = scored.map(s => `- ${s.content}`).join("\n");

    // 4️⃣ Gera uma resposta em linguagem natural
    const answer = await generateResponse(query, context);

    // 🗂️ 5. Registra o log da conversa no banco
    try {
      await pool.query(
        `INSERT INTO conversation_logs (id, user_id, query, answer, memories_used)
        VALUES ($1, $2, $3, $4, $5)`,
        [uuid(), user_id, query, answer, JSON.stringify(scored)]
      );
    } catch (err) {
    console.error("❌ Erro ao registrar log da conversa:", err);
    }

    // ✅ Envia resposta final
    res.json({ query, answer, top_results: scored });
  } catch (err) {
    console.error("❌ Respond error:", err);
    res.status(500).json({ error: "Response generation failed", details: err.message });
  }
});

export default router;
