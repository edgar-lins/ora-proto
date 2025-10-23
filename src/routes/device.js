import express from "express";
import { pool } from "../db/index.js";
import { v4 as uuid } from "uuid";
import fetch from "node-fetch";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Gera o vetor semântico (embedding)
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
 * Filtra memórias muito curtas ou triviais
 */
function isTrivial(text) {
  if (!text) return true;
  const lower = text.trim().toLowerCase();
  const short = lower.split(/\s+/).length < 5;
  const trivialPatterns = ["ok", "sim", "haha", "beleza", "vlw", "valeu", "kk"];
  const isTrivialWord = trivialPatterns.some((w) => lower.includes(w));
  return short || isTrivialWord;
}

/**
 * Gera resumo curto e tags automáticas via modelo
 */
async function enrichMemory(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que gera resumos e tags para anotações pessoais curtas.",
        },
        {
          role: "user",
          content: `Texto: "${text}". Gere um resumo em até 12 palavras e 3 tags relevantes.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const output = response.choices?.[0]?.message?.content?.trim() || "";
    const [summaryRaw, tagsRaw] = output.split(/Tags?:/i);
    const summary = summaryRaw?.trim();
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;\n]/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    return { summary, tags };
  } catch (err) {
    console.error("⚠️ Erro ao gerar resumo/tags:", err);
    return { summary: text.slice(0, 60), tags: [] };
  }
}

/**
 * Endpoint principal de eventos (criação de memórias)
 */
router.post("/event", async (req, res) => {
  try {
    const { user_id, text, metadata } = req.body;

    if (!user_id || !text) {
      return res.status(400).json({ error: "Missing user_id or text" });
    }

    // 🧩 Filtro de trivialidade
    if (isTrivial(text)) {
      return res.status(400).json({ error: "Memory too short or trivial" });
    }

    // 🧠 Enriquecimento semântico
    const { summary, tags } = await enrichMemory(text);

    // 🔢 Geração do vetor semântico
    const embedding = await generateEmbedding(text);
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Failed to generate valid embedding for content");
    }

    // 💾 Salvamento no banco
    const id = uuid();
    await pool.query(
      `INSERT INTO memories (id, user_id, content, embedding, summary, tags, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [id, user_id, text, JSON.stringify(embedding), summary, tags,  JSON.stringify(metadata) || "{}"]
    );

    res.json({
      status: "ok",
      memory_id: id,
      summary,
      tags,
    });
  } catch (err) {
    console.error("❌ Error saving memory:", err);
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

/**
 * 🧠 POST /api/v1/device/memories/reprocess
 * Reanalisa memórias antigas e gera resumo + tags
 * Se "dry_run" = true, apenas simula sem salvar
 */
router.post("/memories/reprocess", async (req, res) => {
  try {
    const { user_id, limit = 10, dry_run = false } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    // Busca memórias sem resumo ou tags
    const { rows: memories } = await pool.query(
      `SELECT id, content
       FROM memories
       WHERE user_id = $1
       AND (summary IS NULL OR summary = '' OR tags IS NULL OR array_length(tags, 1) = 0)
       ORDER BY created_at ASC
       LIMIT $2`,
      [user_id, limit]
    );

    if (memories.length === 0) {
      return res.json({ status: "ok", message: "Nenhuma memória pendente de reprocessamento." });
    }

    const updated = [];

    for (const memory of memories) {
      const { summary, tags } = await enrichMemory(memory.content);
      updated.push({ id: memory.id, summary, tags });

      // Se não for dry_run, aplica as alterações no banco
      if (!dry_run) {
        await pool.query(
          `UPDATE memories SET summary = $1, tags = $2 WHERE id = $3`,
          [summary, tags, memory.id]
        );
      }
    }

    res.json({
      status: "ok",
      mode: dry_run ? "dry_run" : "update",
      message: dry_run
        ? `${updated.length} memórias simuladas (nenhuma alteração feita).`
        : `${updated.length} memórias reprocessadas com sucesso.`,
      updated,
    });
  } catch (err) {
    console.error("❌ Erro ao reprocessar memórias:", err);
    res.status(500).json({ error: "Failed to reprocess memories", details: err.message });
  }
});


export default router;
