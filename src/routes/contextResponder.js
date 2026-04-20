import express from "express";
import { pool } from "../db/index.js";
import { openai } from "../utils/openaiClient.js";
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";
import { getTodayEvents } from "../utils/calendarService.js";

const router = express.Router();

// 🔒 Limiar mínimo de confiança para usar contexto
const SIMILARITY_MIN = 0.35;

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
    const hasContext = topSim >= SIMILARITY_MIN;

    // Busca agenda do dia (se usuário tiver Google Calendar conectado)
    const calendarEvents = await getTodayEvents(user_id).catch(() => null);
    // null = sem integração, [] = integração ativa mas dia livre
    const calendarBlock = calendarEvents === null
      ? null
      : calendarEvents.length
        ? `Agenda de hoje:\n${calendarEvents.join("\n")}`
        : `Agenda de hoje: nenhum compromisso agendado.`;

    const contextBlock = hasContext
      ? scored.map((m, i) => `(${i + 1}) ${m.summary || m.content}`).join("\n")
      : "";

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

    // 4️⃣ Monta prompt
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const systemParts = [`Você é o ORA — assistente pessoal de vida do usuário. Você é empático, direto, inteligente e age como um amigo próximo que se importa de verdade.

Sua personalidade:
- Quando o usuário compartilha dados de saúde (peso, altura, exames), você REAGE com inteligência: calcula IMC, identifica riscos, propõe ações concretas
- Quando menciona objetivos (academia, leitura, trabalho), você ajuda a estruturar e cobra depois
- Você lembra de tudo e usa isso para ser proativo e relevante
- NÃO seja genérico. Seja específico com os dados que você tem
- Responda em 1–3 frases naturais. Para planos ou análises, pode ser um pouco mais longo

Data/hora atual: ${now}`];

    if (hasContext) {
      systemParts.push(`\n\nO que você sabe sobre o usuário:\n${contextBlock}`);
      systemParts.push(`\n\nUse esses dados para personalizar sua resposta. NÃO invente informações que não estão acima.`);
    }

    if (calendarBlock !== null) {
      systemParts.push(`\n\nVocê TEM acesso à agenda do usuário. ${calendarBlock}\nNUNCA diga que não tem acesso à agenda.`);
    }

    const systemPrompt = {
      role: "system",
      content: systemParts.join(""),
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
