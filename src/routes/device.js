import express from "express";
import { pool } from "../db/index.js";
import { v4 as uuid } from "uuid";
import { openai } from "../utils/openaiClient.js";
import { generateEmbedding } from "../utils/math.js";

const router = express.Router();

/**
 * ⚙️ Filtra memórias muito curtas ou triviais
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
 * ✨ Gera resumo e tags automáticos para uma nova memória
 */
async function enrichMemory(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um assistente que gera:
- Um resumo curto (até 12 palavras)
- Até 3 tags no formato #Palavra ou #DuasPalavras, separadas por vírgula.

Responda **sempre** neste formato:
Resumo: <texto>
Tags: #tag1, #tag2, #tag3`,
        },
        {
          role: "user",
          content: `Texto: "${text}"`,
        },
      ],
      temperature: 0.3,
    });

    const output = completion.choices[0].message.content || "";

    // Garante extração mesmo se vier sem "Tags:"
    const summaryMatch = output.match(/Resumo:\s*(.*)/i);
    const tagsMatch = output.match(/Tags?:\s*(.*)/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : text.slice(0, 100);
    const tags = tagsMatch
      ? tagsMatch[1]
          .split(/[,#]/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .map((t) => (t.startsWith("#") ? t : `#${t}`))
      : [];

    return { summary, tags };
  } catch (err) {
    console.error("⚠️ Erro ao enriquecer memória manual:", err);
    return { summary: text.slice(0, 60), tags: [] };
  }
}


/**
 * 📥 POST /api/v1/device/event
 * Cria uma nova memória manual
 */
router.post("/event", async (req, res) => {
  try {
    const { user_id, content, metadata } = req.body;

    if (!user_id || !content) {
      return res.status(400).json({ error: "Missing user_id or content" });
    }

    // 🧩 Filtro de trivialidade
    if (isTrivial(content)) {
      return res.status(400).json({ error: "Memory too short or trivial" });
    }

    // 🧠 Enriquecimento semântico (resumo + tags)
    const { summary, tags } = await enrichMemory(content);

    // 🔢 Geração do vetor semântico
    const embedding = await generateEmbedding(content);
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Failed to generate valid embedding for content");
    }

    // 💾 Salvamento no banco
    const id = uuid();
    await pool.query(
      `
      INSERT INTO memories (id, user_id, content, summary, tags, metadata, embedding, type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', NOW())
      `,
      [id, user_id, content, summary, tags, metadata || {}, JSON.stringify(embedding)]
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
 * 🔁 POST /api/v1/device/memories/reprocess
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
      return res.json({
        status: "ok",
        message: "Nenhuma memória pendente de reprocessamento.",
      });
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
    res.status(500).json({
      error: "Failed to reprocess memories",
      details: err.message,
    });
  }
});

export default router;
