import { pool } from "../db/index.js";
import { openai } from "./openaiClient.js";

export async function analyzeAndSuggest(user_id) {
  const now = new Date();
  const nowStr = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const [memoriesRes, metricsRes, examsRes, goalsRes, pastInsightsRes] = await Promise.all([
    pool.query(
      `SELECT content, created_at FROM memories
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [user_id]
    ),
    pool.query(
      `SELECT DISTINCT ON (type) type, value, unit, date
       FROM health_metrics WHERE user_id = $1
       ORDER BY type, date DESC`,
      [user_id]
    ),
    pool.query(
      `SELECT exam_type, exam_date, analysis, values
       FROM health_exams WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 4`,
      [user_id]
    ),
    pool.query(
      `SELECT g.id, g.title, g.target_description, g.deadline,
              COUNT(t.id)                                              AS total_tasks,
              COUNT(t.id) FILTER (WHERE t.completed)                  AS done_tasks,
              COUNT(t.id) FILTER (WHERE t.date < CURRENT_DATE
                                    AND NOT t.completed)              AS overdue,
              COUNT(t.id) FILTER (WHERE t.date = CURRENT_DATE)        AS today_total,
              COUNT(t.id) FILTER (WHERE t.date = CURRENT_DATE
                                    AND t.completed)                  AS today_done
       FROM goals g
       LEFT JOIN goal_tasks t ON t.goal_id = g.id
       WHERE g.user_id = $1 AND g.status = 'active'
       GROUP BY g.id`,
      [user_id]
    ),
    pool.query(
      `SELECT message, category, created_at
       FROM proactive_log
       WHERE user_id = $1 AND should_notify = true
       ORDER BY created_at DESC LIMIT 12`,
      [user_id]
    ),
  ]);

  const memories = memoriesRes.rows;
  const metrics  = metricsRes.rows;
  const exams    = examsRes.rows;
  const goals    = goalsRes.rows;
  const past     = pastInsightsRes.rows;

  if (!memories.length && !metrics.length && !goals.length) {
    return { shouldNotify: false, message: null, reason: "no_data" };
  }

  // --- Monta blocos de contexto ---

  const memoriesBlock = memories.length
    ? memories.map((m) => `[${new Date(m.created_at).toLocaleDateString("pt-BR")}] ${m.content}`).join("\n")
    : "Nenhuma memória registrada.";

  const metricsBlock = metrics.length
    ? metrics.map((m) => `${m.type}: ${m.value} ${m.unit} (${new Date(m.date).toLocaleDateString("pt-BR")})`).join(" | ")
    : "Nenhuma métrica registrada.";

  const examsBlock = exams.length
    ? exams.map((e) => {
        const data = typeof e.values === "string" ? JSON.parse(e.values) : e.values;
        const alerts   = data?.alerts?.length   ? "Alertas: " + data.alerts.join("; ")   : "";
        const positive = data?.positive?.length ? "Ok: " + data.positive.slice(0,2).join("; ") : "";
        const date = e.exam_date ? new Date(e.exam_date).toLocaleDateString("pt-BR") : "?";
        return `${e.exam_type} (${date}): ${e.analysis}. ${alerts} ${positive}`.trim();
      }).join("\n")
    : "Nenhum exame registrado.";

  const goalsBlock = goals.length
    ? goals.map((g) => {
        const pct = g.total_tasks > 0 ? Math.round((g.done_tasks / g.total_tasks) * 100) : 0;
        const deadline = g.deadline ? ` | Prazo: ${new Date(g.deadline).toLocaleDateString("pt-BR")}` : "";
        return (
          `Meta: "${g.title}" — ${pct}% concluído (${g.done_tasks}/${g.total_tasks} tarefas)` +
          ` | Atrasadas: ${g.overdue} | Hoje: ${g.today_done}/${g.today_total}${deadline}`
        );
      }).join("\n")
    : "Nenhuma meta ativa.";

  const pastBlock = past.length
    ? past.map((p) => `[${new Date(p.created_at).toLocaleDateString("pt-BR")}] (${p.category}) ${p.message}`).join("\n")
    : "Nenhuma mensagem enviada ainda.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: `Você é ORA — assistente pessoal de Edgar Lins. Agora está operando em modo de vigilância silenciosa: analisando todos os dados disponíveis para encontrar algo que MERECE atenção real.

Data/hora: ${nowStr}

MISSÃO: Encontrar UMA conexão significativa entre domínios diferentes — algo que Edgar não pediu mas que faz sentido falar agora. Não motivação genérica. Não repetição. Uma observação específica com números ou datas reais.

PADRÕES PARA BUSCAR (escolha o mais relevante):
- Saúde + hábito: exame alterado + comportamento relacionado nas memórias
- Meta + progresso: meta com tarefas atrasadas ou ritmo de conclusão abaixo do esperado
- Meta + saúde: objetivo de saúde vs dados de exame ou métricas que mostram progresso ou regressão
- Tempo + saúde: exame ou métrica com mais de 90 dias sem atualização
- Memória + omissão: Edgar mencionou querer fazer X há mais de 2 semanas e não voltou a falar
- Calendário + meta: tarefa atrasada que deveria ter acontecido ontem ou hoje

REGRAS:
- NUNCA repita uma mensagem já enviada (listadas abaixo)
- Cada insight deve ser um PASSO À FRENTE do último — se cobrou treino, agora pergunte como foi
- Máximo 2 frases. Específico: use números, datas, nomes reais
- Tom: JARVIS. Preciso, levemente irônico, nunca alarmista
- Chame-o de "sir" ou "Edgar"
- Se não houver NADA genuinamente relevante, retorne should_notify: false — silêncio é melhor que ruído

Responda APENAS JSON válido:
{
  "should_notify": true | false,
  "message": "mensagem em português | null",
  "category": "health | goals | habits | reminder | null",
  "reason": "motivo interno breve"
}`,
      },
      {
        role: "user",
        content: `=== INSIGHTS JÁ ENVIADOS (não repetir) ===
${pastBlock}

=== MEMÓRIAS RECENTES ===
${memoriesBlock}

=== MÉTRICAS DE SAÚDE ===
${metricsBlock}

=== EXAMES ===
${examsBlock}

=== METAS E PROGRESSO ===
${goalsBlock}`,
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();

  try {
    const result = JSON.parse(raw);
    return {
      shouldNotify: result.should_notify === true,
      message:  result.message  || null,
      category: result.category || null,
      reason:   result.reason   || null,
    };
  } catch {
    console.error("❌ Proactive engine JSON parse error:", raw);
    return { shouldNotify: false, message: null, reason: "parse_error" };
  }
}
