import express from "express";
import { pool } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";
import { openai } from "../utils/openaiClient.js";
import { generateEmbedding } from "../utils/math.js";

const router = express.Router();

/**
 * Função utilitária para enriquecer o texto com resumo e tags
 */
async function enrichMemory(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que gera resumos curtos (até 12 palavras) e até 3 tags relevantes para anotações pessoais. As tags devem começar com # e serem curtas (uma ou duas palavras).",
        },
        {
          role: "user",
          content: `Texto: "${text}". Gere um resumo e até 3 tags relevantes.`,
        },
      ],
      temperature: 0.3,
    });

    const output = completion.choices[0].message.content;
    const [summaryLine, tagsLine] = output.split(/\n|Tags?:/i);
    const summary = summaryLine?.trim() || text.slice(0, 100);
    const tags = tagsLine
      ? tagsLine
          .split(/[,;]/)
          .map((t) => t.trim().replace(/^#?/, "#")) // garante que todas comecem com #
          .filter(Boolean)
      : [];

    return { summary, tags };
  } catch (err) {
    console.error("⚠️ Erro ao enriquecer memória:", err);
    return { summary: text.slice(0, 60), tags: [] };
  }
}

/**
 * POST /api/v1/memory/auto
 * Registra automaticamente uma nova memória a partir de uma resposta do ORA.
 */
router.post("/auto", async (req, res) => {
  try {
    const { user_id, query, answer, context_used } = req.body;

    if (!user_id || !answer) {
      return res.status(400).json({ error: "Missing user_id or answer" });
    }

    // Texto que será gravado como memória
    const memoryText = `Pergunta: ${query}\nResposta: ${answer}`;

    // Gera embedding e enriquecimento
    const embedding = await generateEmbedding(memoryText);
    const { summary, tags } = await enrichMemory(memoryText);

    const id = uuidv4();

    // 🧠 Insere no banco com type='auto'
    await pool.query(
      `
      INSERT INTO memories (id, user_id, content, summary, tags, embedding, metadata, type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto', NOW())
      `,
      [
        id,
        user_id,
        memoryText,
        summary,
        tags,
        JSON.stringify(embedding),
        { source: "auto", context_used },
      ]
    );

    res.json({
      status: "ok",
      memory_id: id,
      summary,
      tags,
    });
  } catch (err) {
    console.error("❌ Erro ao salvar memória automática:", err);
    res.status(500).json({
      error: "Erro ao criar memória automática",
      details: err.message,
    });
  }
});

export default router;
