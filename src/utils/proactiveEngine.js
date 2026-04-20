import { pool } from "../db/index.js";
import { openai } from "./openaiClient.js";

/**
 * Analisa as memórias do usuário e decide se ORA tem algo relevante a dizer.
 * Usa o histórico de mensagens já enviadas para nunca repetir — só evoluir.
 */
export async function analyzeAndSuggest(user_id) {
  // Busca memórias e histórico de insights anteriores em paralelo
  const [memoriesResult, historyResult] = await Promise.all([
    pool.query(
      `SELECT content, created_at
       FROM memories
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 80`,
      [user_id]
    ),
    pool.query(
      `SELECT message, category, created_at
       FROM proactive_log
       WHERE user_id = $1 AND should_notify = true
       ORDER BY created_at DESC
       LIMIT 20`,
      [user_id]
    ),
  ]);

  const memories = memoriesResult.rows;
  const pastInsights = historyResult.rows;

  if (!memories.length) return { shouldNotify: false, message: null };

  const memorySummary = memories
    .map((m) => {
      const date = new Date(m.created_at).toLocaleDateString("pt-BR");
      return `[${date}] ${m.content}`;
    })
    .join("\n");

  const pastInsightsSummary = pastInsights.length
    ? pastInsights
        .map((p) => {
          const date = new Date(p.created_at).toLocaleDateString("pt-BR");
          return `[${date}] (${p.category}) ${p.message}`;
        })
        .join("\n")
    : "Nenhuma mensagem enviada ainda.";

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `Você é o motor de inteligência proativa do ORA — assistente pessoal de vida.

Data/hora atual: ${now}

Sua missão: acompanhar a jornada do usuário ao longo do tempo, evoluindo os insights conforme ele cresce.

REGRA MAIS IMPORTANTE: Você já enviou mensagens anteriores ao usuário (listadas abaixo).
NUNCA repita um insight já comunicado. Sempre evolua — se já falou sobre IMC, agora fale sobre próximos passos. Se já cobrou academia, agora pergunte como foi.

Analise:
1. SAÚDE: Peso, altura, IMC, exames. Se já comunicou o IMC, avance para plano de ação.
2. HÁBITOS: Objetivos mencionados sem acompanhamento. Cobre com carinho e especificidade.
3. TEMPO: Quanto tempo passou desde eventos importantes? Exames > 6 meses = lembrete.
4. EVOLUÇÃO: Compare memórias antigas com recentes. Houve progresso? Regressão?
5. GAPS: O que o usuário mencionou querer fazer mas não voltou a falar?

Tom: amigo próximo, específico, sem julgamento, máximo 2 frases.

Responda APENAS com JSON válido:
{
  "should_notify": true ou false,
  "message": "mensagem em português ou null",
  "category": "health | habits | growth | reminder | null",
  "reason": "motivo interno"
}`,
      },
      {
        role: "user",
        content: `=== MENSAGENS JÁ ENVIADAS AO USUÁRIO (não repetir) ===\n${pastInsightsSummary}\n\n=== MEMÓRIAS DO USUÁRIO ===\n${memorySummary}`,
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();

  try {
    const result = JSON.parse(raw);
    return {
      shouldNotify: result.should_notify === true,
      message: result.message || null,
      category: result.category || null,
      reason: result.reason || null,
    };
  } catch {
    console.error("❌ Proactive engine JSON parse error:", raw);
    return { shouldNotify: false, message: null };
  }
}
