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

/**
 * POST /api/v1/memory/consolidate/:user_id
 * Agrupa fatos similares e os mescla em memórias consolidadas via GPT.
 * Reduz ruído e cria memórias mais ricas e estáveis.
 */
router.post("/consolidate/:user_id", async (req, res) => {
  const { user_id } = req.params;

  try {
    const { rows: facts } = await pool.query(
      `SELECT id, content, embedding FROM memories
       WHERE user_id = $1 AND type = 'fact' AND embedding IS NOT NULL
       ORDER BY created_at DESC`,
      [user_id]
    );

    if (facts.length < 4) {
      return res.json({ status: "ok", message: "Poucos fatos para consolidar", consolidated: 0 });
    }

    // Importa cosineSimilarity inline
    const { cosineSimilarity } = await import("../utils/math.js");

    // Monta clusters por similaridade (> 0.78)
    const parsed = facts.map((f) => {
      try { return { ...f, emb: JSON.parse(f.embedding) }; } catch { return null; }
    }).filter(Boolean);

    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < parsed.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [parsed[i]];
      visited.add(i);
      for (let j = i + 1; j < parsed.length; j++) {
        if (visited.has(j)) continue;
        if (cosineSimilarity(parsed[i].emb, parsed[j].emb) > 0.78) {
          cluster.push(parsed[j]);
          visited.add(j);
        }
      }
      if (cluster.length >= 2) clusters.push(cluster);
    }

    if (!clusters.length) {
      return res.json({ status: "ok", message: "Nenhum cluster encontrado", consolidated: 0 });
    }

    let consolidated = 0;

    for (const cluster of clusters) {
      const factList = cluster.map((f) => `- ${f.content}`).join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `Você consolida fatos relacionados sobre uma pessoa em UMA única frase rica e precisa.
Preserve datas, números e detalhes específicos. Máximo 2 frases. Não invente.`,
          },
          { role: "user", content: `Consolide estes fatos:\n${factList}` },
        ],
      });

      const merged = completion.choices[0].message.content?.trim();
      if (!merged) continue;

      const embedding = await generateEmbedding(merged);

      // Apaga fatos originais do cluster e insere o consolidado
      const ids = cluster.map((f) => f.id);
      await pool.query(`DELETE FROM memories WHERE id = ANY($1)`, [ids]);
      await pool.query(
        `INSERT INTO memories (id, user_id, content, summary, type, metadata, embedding, created_at)
         VALUES ($1, $2, $3, $4, 'fact', $5, $6, NOW())`,
        [uuidv4(), user_id, merged, merged.slice(0, 100),
         JSON.stringify({ source: "consolidation", merged_count: cluster.length }),
         JSON.stringify(embedding)]
      );

      consolidated++;
    }

    console.log(`🗜 Consolidação [${user_id}]: ${consolidated} clusters mesclados`);
    res.json({ status: "ok", consolidated, clusters_found: clusters.length });
  } catch (err) {
    console.error("❌ Consolidation error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
