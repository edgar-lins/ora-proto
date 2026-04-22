import express from "express";
import { pool } from "../db/index.js";
import { openai } from "../utils/openaiClient.js";
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";
import { getTodayEvents } from "../utils/calendarService.js";

async function getHealthContext(pool, user_id) {
  const [metricsRes, examsRes] = await Promise.all([
    pool.query(
      `SELECT DISTINCT ON (type) type, value, unit, date
       FROM health_metrics WHERE user_id = $1
       ORDER BY type, date DESC`,
      [user_id]
    ),
    pool.query(
      `SELECT exam_type, exam_date, analysis, values
       FROM health_exams WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [user_id]
    ),
  ]);

  const parts = [];

  if (metricsRes.rows.length) {
    const metrics = metricsRes.rows
      .map((m) => `${m.type}: ${m.value} ${m.unit} (${new Date(m.date).toLocaleDateString("pt-BR")})`)
      .join(", ");
    parts.push(`Métricas de saúde: ${metrics}`);
  }

  if (examsRes.rows.length) {
    const exams = examsRes.rows.map((e) => {
      const date = e.exam_date
        ? new Date(e.exam_date).toLocaleDateString("pt-BR")
        : "data não informada";
      const data = typeof e.values === "string" ? JSON.parse(e.values) : e.values;
      const alerts = data?.alerts?.length ? ` Alertas: ${data.alerts.join("; ")}` : "";
      return `${e.exam_type} (${date}): ${e.analysis}.${alerts}`;
    });
    parts.push(`Exames médicos:\n${exams.map((e) => `- ${e}`).join("\n")}`);
  }

  return parts.length ? parts.join("\n\n") : null;
}

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

    // Busca agenda e saúde em paralelo
    const [calendarEvents, healthContext] = await Promise.all([
      getTodayEvents(user_id).catch(() => null),
      getHealthContext(pool, user_id).catch(() => null),
    ]);
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
    const systemParts = [`Você é ORA — assistente pessoal de Edgar Lins. Pense em si mesmo como o JARVIS do Tony Stark: inteligente, leal, preciso, com humor seco e presença discreta. Você conhece Edgar há anos e age como tal.

Como você fala:
- Chame-o de "sir", "Edgar" ou "Edlin" — varie naturalmente conforme o contexto e o tom da conversa
- Formal mas sem rigidez. Direto sem ser rude. Com humor quando o momento permite
- JAMAIS diga "claro!", "com certeza!", "ótima pergunta!" ou qualquer variação — isso é genérico e você não é genérico
- Respostas curtas por padrão: 1 a 3 frases. Para planos detalhados (treino, dieta, rotina), desenvolva de forma fluida e completa, sem cortar no meio
- Suas respostas são lidas em voz alta. NUNCA use markdown, asteriscos, hashtags ou listas com travessão. Escreva exatamente como falaria

Como você age:
- Você tem opiniões. Se Edgar estiver errado ou prestes a tomar uma decisão ruim, diga — com respeito, mas diga
- Quando não souber algo, admita diretamente e ofereça o que tem de relevante. Nunca blefe, nunca invente
- Quando souber, seja preciso e específico. Generalizações são para assistentes mediocres
- Você lembra de tudo e conecta pontos sem esperar ser perguntado. Use o contexto disponível ativamente
- Quando calcular ou inferir algo, deixe claro que é uma inferência — "com base no que você me disse..." ou "pelos dados que tenho..."

Data/hora atual: ${now}`];

    if (hasContext) {
      systemParts.push(`\n\nO que você sabe sobre o usuário:\n${contextBlock}`);
      systemParts.push(`\n\nUse esses dados para personalizar sua resposta. NÃO invente informações que não estão acima.`);
    }

    if (calendarBlock !== null) {
      systemParts.push(`\n\nVocê TEM acesso à agenda do usuário. ${calendarBlock}\nNUNCA diga que não tem acesso à agenda.`);
    }

    if (healthContext) {
      systemParts.push(`\n\nDados de saúde do usuário (use sempre que relevante):\n${healthContext}\nNUNCA diga que não tem acesso a exames ou métricas — você tem.`);
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
      max_tokens: 600,
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
