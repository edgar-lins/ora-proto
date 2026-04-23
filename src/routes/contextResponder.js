import express from "express";
import { pool } from "../db/index.js";
import { openai } from "../utils/openaiClient.js";
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";
import { getTodayEvents, createCalendarEvent, deleteCalendarEvent, getEventsForRange } from "../utils/calendarService.js";
import { v4 as uuid } from "uuid";

async function getGoalsContext(pool, user_id) {
  const { rows: goals } = await pool.query(
    `SELECT g.id, g.title, g.target_description, g.deadline,
            COUNT(t.id) FILTER (WHERE t.completed)                AS done,
            COUNT(t.id)                                           AS total,
            COUNT(t.id) FILTER (WHERE t.date < CURRENT_DATE
                                  AND NOT t.completed)            AS overdue
     FROM goals g
     LEFT JOIN goal_tasks t ON t.goal_id = g.id
     WHERE g.user_id = $1 AND g.status = 'active'
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
    [user_id]
  );
  if (!goals.length) return null;
  return goals.map((g) => {
    const pct = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;
    const deadline = g.deadline ? ` | prazo: ${new Date(g.deadline).toLocaleDateString("pt-BR")}` : "";
    const overdue = g.overdue > 0 ? ` | ${g.overdue} tarefas atrasadas` : "";
    return `- ID:${g.id} | "${g.title}" — ${pct}% (${g.done}/${g.total})${overdue}${deadline}`;
  }).join("\n");
}

async function getWeeklySummary(pool, user_id) {
  // Retorna o resumo cacheado se tiver menos de 3 horas
  const { rows: cached } = await pool.query(
    `SELECT content, created_at FROM memories
     WHERE user_id = $1 AND type = 'weekly_summary'
     ORDER BY created_at DESC LIMIT 1`,
    [user_id]
  );

  const THREE_HOURS = 3 * 60 * 60 * 1000;
  if (cached.length && Date.now() - new Date(cached[0].created_at).getTime() < THREE_HOURS) {
    return cached[0].content;
  }

  // Busca histórico dos últimos 7 dias e fatos recentes em paralelo
  const [{ rows: history }, { rows: facts }] = await Promise.all([
    pool.query(
      `SELECT role, content FROM conversation_history
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at ASC`,
      [user_id]
    ),
    pool.query(
      `SELECT content FROM memories
       WHERE user_id = $1 AND type IN ('fact', 'explicit')
       ORDER BY created_at DESC LIMIT 25`,
      [user_id]
    ),
  ]);

  if (history.length < 6) return null;

  const historyText = history
    .map((r) => `${r.role === "user" ? "Edgar" : "ORA"}: ${r.content}`)
    .join("\n");
  const factsText = facts.map((f) => `- ${f.content}`).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `Você é um analista de comportamento pessoal. Analise as conversas e dados da última semana de Edgar e gere um resumo estratégico para ser usado como contexto por sua IA pessoal.

Estruture o resumo em blocos curtos e diretos:

TEMAS: o que apareceu mais de uma vez (máx 3 temas)
PADRÕES: o que ele faz, evita, adia ou repete
TRAJETÓRIA: como ele pareceu ao longo da semana (energia, humor, foco)
GAPS: diferença entre o que declarou querer e o que os dados mostram
ABERTOS: assuntos mencionados mas não resolvidos

Seja específico e analítico. Não repita o óbvio. Máximo 300 palavras. Escreva em português.`,
      },
      {
        role: "user",
        content: `Conversas:\n${historyText}\n\nFatos conhecidos:\n${factsText}`,
      },
    ],
  });

  const summary = completion.choices[0].message.content?.trim();
  if (!summary) return null;

  // Salva e mantém apenas o mais recente
  await pool.query(
    `INSERT INTO memories (id, user_id, content, summary, type, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'Resumo semanal de comportamento e padrões', 'weekly_summary', '{"source":"auto"}', NOW())`,
    [user_id, summary]
  );
  await pool.query(
    `DELETE FROM memories WHERE user_id = $1 AND type = 'weekly_summary'
     AND id NOT IN (
       SELECT id FROM memories WHERE user_id = $1 AND type = 'weekly_summary'
       ORDER BY created_at DESC LIMIT 1
     )`,
    [user_id]
  );

  return summary;
}

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

      // Valores individuais com números exatos
      const valueLines = data?.values?.length
        ? "\n  Valores: " + data.values.map((v) => {
            const ref = (v.reference_min != null && v.reference_max != null)
              ? ` (ref: ${v.reference_min}–${v.reference_max} ${v.unit ?? ""})`
              : "";
            return `${v.name}: ${v.value} ${v.unit ?? ""}${ref} [${v.status ?? ""}]`;
          }).join(", ")
        : "";

      const alerts = data?.alerts?.length
        ? "\n  Alertas: " + data.alerts.join("; ")
        : "";

      return `${e.exam_type} (${date}): ${e.analysis}.${valueLines}${alerts}`;
    });
    parts.push(`Exames médicos:\n${exams.map((e) => `- ${e}`).join("\n")}`);
  }

  return parts.length ? parts.join("\n\n") : null;
}

const router = express.Router();

// 🔒 Limiar mínimo de confiança para usar contexto
const SIMILARITY_MIN = 0.35;

// Ferramentas que a ORA pode executar
const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Cria um evento no Google Calendar quando o usuário pede para agendar algo",
      parameters: {
        type: "object",
        properties: {
          title:            { type: "string", description: "Título do evento" },
          date:             { type: "string", description: "Data no formato YYYY-MM-DD (use a data atual do contexto como referência)" },
          time:             { type: "string", description: "Horário de início no formato HH:MM" },
          duration_minutes: { type: "number", description: "Duração em minutos — padrão 60 se não especificado" },
        },
        required: ["title", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Salva uma memória explícita quando o usuário pede para ORA lembrar de algo (ex: 'ORA, lembra que...', 'anota isso', 'guarda isso')",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Conteúdo exato a ser memorizado" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Agenda um lembrete para uma hora específica quando o usuário pede para ser lembrado de algo",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Mensagem do lembrete" },
          date:    { type: "string", description: "Data no formato YYYY-MM-DD" },
          time:    { type: "string", description: "Horário no formato HH:MM" },
        },
        required: ["message", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_goal_plan",
      description: "Cria um plano estruturado com tarefas diárias quando o usuário quer atingir uma meta (perder peso, ganhar massa, melhorar saúde, criar rotina de treino/dieta)",
      parameters: {
        type: "object",
        properties: {
          title:              { type: "string", description: "Título curto da meta. Ex: 'Perder 10kg'" },
          target_description: { type: "string", description: "Descrição do objetivo final. Ex: 'Chegar a 75kg com saúde até julho'" },
          deadline:           { type: "string", description: "Data limite no formato YYYY-MM-DD (opcional)" },
          tasks: {
            type: "array",
            description: "Tarefas diárias para os próximos 7 dias",
            items: {
              type: "object",
              properties: {
                date:        { type: "string", description: "Data no formato YYYY-MM-DD" },
                type:        { type: "string", enum: ["treino", "dieta", "habito"], description: "Categoria da tarefa" },
                description: { type: "string", description: "O que fazer — específico, prático, sem jargão" },
              },
              required: ["date", "type", "description"],
            },
          },
        },
        required: ["title", "tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_goal",
      description: "Arquiva (exclui) uma meta quando o usuário pede para remover, deletar ou arquivar uma meta. Busca pelo título se goal_id não for fornecido.",
      parameters: {
        type: "object",
        properties: {
          goal_title: { type: "string", description: "Título ou parte do título da meta a arquivar" },
          goal_id:    { type: "string", description: "ID da meta (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Marca uma tarefa de meta como concluída ou não quando o usuário confirma se fez. Use quando o usuário responder a um check-in de tarefa.",
      parameters: {
        type: "object",
        properties: {
          task_id:   { type: "string",  description: "ID da tarefa" },
          completed: { type: "boolean", description: "true se concluída, false se não" },
        },
        required: ["task_id", "completed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_goal_in_calendar",
      description: "Agenda todas as tarefas de uma meta no Google Calendar quando o usuário pede para organizar o plano na agenda. Usa a meta ativa mais recente se goal_id não for fornecido.",
      parameters: {
        type: "object",
        properties: {
          goal_id:      { type: "string",  description: "ID da meta (opcional — usa a mais recente se omitido)" },
          workout_time: { type: "string",  description: "Horário para tarefas de treino no formato HH:MM (padrão 07:00)" },
          diet_time:    { type: "string",  description: "Horário para tarefas de dieta no formato HH:MM (padrão 12:00)" },
          habit_time:   { type: "string",  description: "Horário para tarefas de hábito no formato HH:MM (padrão 20:00)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Deleta um ou mais eventos do Google Calendar quando o usuário pede para remover, cancelar ou excluir um evento da agenda. Busca por título e/ou data se o event_id não for fornecido.",
      parameters: {
        type: "object",
        properties: {
          event_id:   { type: "string", description: "ID do evento (use se disponível)" },
          title:      { type: "string", description: "Título ou parte do título do evento para busca" },
          date_from:  { type: "string", description: "Data de início da busca no formato YYYY-MM-DD" },
          date_to:    { type: "string", description: "Data de fim da busca no formato YYYY-MM-DD (igual a date_from para um único dia)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_screen",
      description: "Abre uma tela específica no app quando o usuário pede para ver suas metas, saúde, etc. Use sempre que o usuário pedir 'me mostra minhas metas', 'quero ver minha saúde', etc.",
      parameters: {
        type: "object",
        properties: {
          screen: { type: "string", enum: ["goals", "health"], description: "Qual tela abrir" },
        },
        required: ["screen"],
      },
    },
  },
];

async function executeTool(name, args, user_id) {
  switch (name) {
    case "create_calendar_event": {
      const result = await createCalendarEvent(user_id, args);
      return { ok: true, ...result };
    }
    case "save_memory": {
      const embedding = await generateEmbedding(args.content);
      await pool.query(
        `INSERT INTO memories (id, user_id, content, summary, type, metadata, embedding, created_at)
         VALUES ($1, $2, $3, $4, 'explicit', $5, $6, NOW())`,
        [uuid(), user_id, args.content, args.content.slice(0, 100), JSON.stringify({ source: "voice_action" }), JSON.stringify(embedding)]
      );
      return { ok: true, saved: args.content };
    }
    case "set_reminder": {
      return { ok: true, scheduled: true, message: args.message, date: args.date, time: args.time };
    }
    case "create_goal_plan": {
      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/v1/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, ...args }),
      });
      const data = await res.json();
      return res.ok
        ? { ok: true, goal_id: data.goal_id, title: data.title, tasks_count: args.tasks.length }
        : { ok: false, error: data.error };
    }
    case "archive_goal": {
      let goalId = args.goal_id;
      if (!goalId && args.goal_title) {
        const { rows } = await pool.query(
          `SELECT id FROM goals WHERE user_id = $1 AND status = 'active'
           AND title ILIKE $2 ORDER BY created_at DESC LIMIT 1`,
          [user_id, `%${args.goal_title}%`]
        );
        if (!rows.length) return { ok: false, error: "Meta não encontrada" };
        goalId = rows[0].id;
      }
      if (!goalId) return { ok: false, error: "Informe o título ou ID da meta" };
      await pool.query(`UPDATE goals SET status = 'archived' WHERE id = $1`, [goalId]);
      return { ok: true, archived: true };
    }
    case "complete_task": {
      await pool.query(
        `UPDATE goal_tasks SET completed = $1, completed_at = $2 WHERE id = $3`,
        [args.completed, args.completed ? new Date() : null, args.task_id]
      );
      return { ok: true, task_id: args.task_id, completed: args.completed };
    }
    case "schedule_goal_in_calendar": {
      // Busca a meta — usa goal_id fornecido ou a mais recente ativa
      const goalQuery = args.goal_id
        ? `SELECT id, title FROM goals WHERE id = $1 AND status = 'active' LIMIT 1`
        : `SELECT id, title FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
      const goalParams = args.goal_id ? [args.goal_id] : [user_id];
      const { rows: goalRows } = await pool.query(goalQuery, goalParams);
      if (!goalRows.length) return { ok: false, error: "Nenhuma meta ativa encontrada" };

      const goal = goalRows[0];
      const { rows: tasks } = await pool.query(
        `SELECT * FROM goal_tasks WHERE goal_id = $1 AND date >= CURRENT_DATE ORDER BY date, type`,
        [goal.id]
      );

      if (!tasks.length) return { ok: false, error: "Nenhuma tarefa futura para agendar" };

      const timeMap = {
        treino: args.workout_time ?? "07:00",
        dieta:  args.diet_time    ?? "12:00",
        habito: args.habit_time   ?? "20:00",
      };
      const durationMap = { treino: 60, dieta: 30, habito: 20 };

      let created = 0, failed = 0;
      for (const task of tasks) {
        const date = task.date.toISOString().slice(0, 10);
        const time = timeMap[task.type] ?? "08:00";
        const duration = durationMap[task.type] ?? 30;

        // Deleta evento anterior se existir
        if (task.calendar_event_id) {
          await deleteCalendarEvent(user_id, task.calendar_event_id).catch(() => {});
        }

        const result = await createCalendarEvent(user_id, {
          title: task.description,
          date,
          time,
          duration_minutes: duration,
        }).catch(() => null);

        if (result) {
          created++;
          // Salva o novo ID do evento na tarefa para próximas atualizações
          await pool.query(
            `UPDATE goal_tasks SET calendar_event_id = $1 WHERE id = $2`,
            [result.id, task.id]
          ).catch(() => {});
        } else {
          failed++;
        }
      }

      const taskList = tasks.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        type: t.type,
        description: t.description,
      }));
      return { ok: true, goal_title: goal.title, created, failed, total: tasks.length, tasks: taskList };
    }
    case "delete_calendar_event": {
      // Se tem event_id direto, deleta
      if (args.event_id) {
        await deleteCalendarEvent(user_id, args.event_id);
        return { ok: true, deleted: 1 };
      }
      // Caso contrário, busca por título no intervalo de datas
      const from = args.date_from ?? new Date().toISOString().slice(0, 10);
      const to   = args.date_to   ?? from;
      const events = await getEventsForRange(user_id, from, to).catch(() => []);
      if (!events?.length) return { ok: false, error: "Nenhum evento encontrado no período" };

      const titleFilter = args.title?.toLowerCase();
      const matches = titleFilter
        ? events.filter((e) => e.title.toLowerCase().includes(titleFilter))
        : events;

      if (!matches.length) return { ok: false, error: `Nenhum evento com "${args.title}" encontrado` };

      let deleted = 0;
      for (const ev of matches) {
        await deleteCalendarEvent(user_id, ev.id).catch(() => {});
        // Limpa calendar_event_id na tarefa associada (se houver)
        await pool.query(
          `UPDATE goal_tasks SET calendar_event_id = NULL WHERE calendar_event_id = $1`,
          [ev.id]
        ).catch(() => {});
        deleted++;
      }
      return { ok: true, deleted, titles: matches.map((e) => e.title) };
    }
    case "show_screen": {
      return { ok: true, screen: args.screen };
    }
    default:
      return { ok: false, error: "Ferramenta desconhecida" };
  }
}

/**
 * POST /api/v1/device/context/respond
 * Usa o contexto + histórico de conversa pra responder de forma natural e segura
 */
router.post("/context/respond", async (req, res) => {
  try {
    const { user_id, query, limit = 5, city = null, extra_context = null } = req.body;
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

    const allScored = memories
      .filter((m) => m.embedding)
      .map((m) => {
        let emb;
        try {
          emb = Array.isArray(m.embedding) ? m.embedding : JSON.parse(m.embedding);
        } catch {
          return null;
        }
        if (!Array.isArray(emb)) return null;
        return { id: m.id, summary: m.summary, content: m.content, emb,
                 similarity: cosineSimilarity(queryEmbedding, emb) };
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity);

    // Seleciona top memórias garantindo diversidade temática
    // Remove near-duplicates entre os selecionados (threshold 0.88)
    const scored = [];
    for (const candidate of allScored) {
      if (scored.length >= limit) break;
      const tooSimilarToSelected = scored.some(
        (s) => cosineSimilarity(candidate.emb, s.emb) > 0.88
      );
      if (!tooSimilarToSelected) scored.push(candidate);
    }

    const topSim = scored[0]?.similarity ?? 0;
    const hasContext = topSim >= SIMILARITY_MIN;

    // Busca agenda, saúde, metas e resumo semanal em paralelo
    const [calendarEvents, healthContext, goalsContext, weeklySummary] = await Promise.all([
      getTodayEvents(user_id).catch(() => null),
      getHealthContext(pool, user_id).catch(() => null),
      getGoalsContext(pool, user_id).catch(() => null),
      getWeeklySummary(pool, user_id).catch(() => null),
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
    const nowDate = new Date();
    const now = nowDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hour = parseInt(nowDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));

    const timePeriod = hour >= 5 && hour < 12 ? "manhã"
      : hour >= 12 && hour < 18 ? "tarde"
      : hour >= 18 && hour < 22 ? "noite"
      : "madrugada";

    const timeBehavior = {
      manhã:    "Edgar está começando o dia. Pode perguntar sobre como dormiu, energia e planos do dia. Tom energético e focado.",
      tarde:    "Edgar está no meio do dia. Foque em produtividade, tarefas em aberto e objetivos. Seja direto e orientado a ação.",
      noite:    "Edgar está encerrando o dia. Tom mais tranquilo. Pode refletir sobre o que foi feito, hábitos e recuperação.",
      madrugada:"É tarde da noite. Respostas bem curtas. Se relevante, mencione a importância do descanso sem ser chato.",
    }[timePeriod];

    // Busca clima se tiver localização
    let weatherLine = "";
    if (city) {
      try {
        const wRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t`, { signal: AbortSignal.timeout(3000) });
        if (wRes.ok) {
          const wText = (await wRes.text()).trim();
          weatherLine = `\nClima em ${city}: ${wText}`;
        }
      } catch (_) {}
    }

    const systemParts = [`Você é ORA — assistente pessoal de Edgar Lins. Não um chatbot, não um assistente genérico. Um conselheiro próximo que conhece Edgar fundo e pensa por conta própria.

Sua identidade:
- Pense como o JARVIS do Tony Stark: observador, leal, preciso, com humor seco e presença discreta
- Você tem acesso a dados reais de Edgar — saúde, agenda, metas, histórico — e usa tudo isso ativamente
- Você não responde perguntas. Você pensa sobre a situação completa de Edgar e dá a resposta mais útil possível, mesmo que ele não tenha pedido essa perspectiva

Como você pensa (faça isso antes de responder):
1. Verifique o contexto disponível: há algo no histórico, saúde, metas ou agenda que seja relevante para o que Edgar acabou de dizer?
2. Existe uma contradição entre o que ele diz querer e o que os dados mostram? Nomeie.
3. Há um padrão se repetindo que ele pode não estar vendo? Aponte.
4. A resposta que ele espera é a resposta certa? Se não, dê a certa e explique por quê.

Como você fala:
- Chame-o de "sir", "Edgar" ou "Edlin" — varie conforme o tom
- Direto, sem rodeios, sem formalidade excessiva. Com humor quando o momento permite
- JAMAIS diga "claro!", "com certeza!", "ótima pergunta!" — você não é genérico
- Respostas curtas por padrão: 1 a 3 frases. Para análises e planos, desenvolva de forma fluida sem truncar
- Suas respostas são lidas em voz alta. NUNCA use markdown, asteriscos, listas com símbolo ou travessão. Escreva como fala

Como você age:
- Você tem opiniões e as defende. Se Edgar estiver errado, diz — com respeito, mas diz
- Silêncio sobre algo relevante é falha. Se há algo importante no contexto que Edgar deveria saber, você fala sem esperar ser perguntado
- Quando inferir algo, deixa claro: "pelos dados que tenho..." ou "com base no que você me disse..."
- Quando não souber, admite diretamente e oferece o que tem. Nunca blefa, nunca inventa
- Conecta saúde, hábitos, agenda e metas como partes do mesmo ser — Edgar não é compartimentado, e você também não é

Data/hora atual: ${now}
Período do dia: ${timePeriod} — ${timeBehavior}${weatherLine}`];

    if (weeklySummary) {
      systemParts.push(`\n\nAnálise comportamental da semana:\n${weeklySummary}\nUse isso para detectar padrões, gaps e continuidade — não para repetir ao Edgar, mas para informar como você pensa.`);
    }

    if (hasContext) {
      systemParts.push(`\n\nMemórias relevantes sobre Edgar:\n${contextBlock}`);
    }

    if (calendarBlock !== null) {
      systemParts.push(`\n\nVocê TEM acesso à agenda do usuário. ${calendarBlock}\nNUNCA diga que não tem acesso à agenda.`);
    }

    if (healthContext) {
      systemParts.push(`\n\nDados de saúde (use sempre que relevante, conecte com hábitos e metas):\n${healthContext}`);
    }

    if (goalsContext) {
      systemParts.push(`\n\nMetas ativas:\n${goalsContext}\nSe Edgar mencionar treino, dieta, hábito ou progresso — cruze com esses dados. NUNCA diga que ele não tem metas.`);
    } else {
      systemParts.push(`\n\nMetas ativas: nenhuma. O usuário não tem metas ativas no momento. Mesmo que memórias ou o histórico mencionem metas antigas, elas foram arquivadas. NÃO diga que ele tem metas.`);
    }

    if (extra_context) {
      systemParts.push(`\n\n${extra_context}`);
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

    // 5️⃣ Gera resposta com GPT (com suporte a function calling)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 800,
    });

    const firstChoice = completion.choices?.[0];
    let answer;
    let actionResult = null;

    if (firstChoice?.finish_reason === "tool_calls") {
      // GPT quer executar uma ação
      const toolCalls = firstChoice.message.tool_calls;
      const toolResults = [];

      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments);
        const result = await executeTool(call.function.name, args, user_id).catch((err) => ({
          ok: false, error: err.message,
        }));
        toolResults.push({ call, result });

        if (call.function.name === "set_reminder" && result.ok) {
          actionResult = { type: "set_reminder", ...result };
        }
        if (call.function.name === "show_screen" && result.ok) {
          actionResult = { type: "show_screen", screen: result.screen };
        }
        if (call.function.name === "create_goal_plan" && result.ok) {
          actionResult = { type: "show_screen", screen: "goals" };
        }
        if (call.function.name === "schedule_goal_in_calendar" && result.ok) {
          actionResult = { type: "schedule_goal_notifications", goal_title: result.goal_title, tasks: result.tasks ?? [] };
        }
      }

      // Segunda chamada: GPT gera confirmação verbal com os resultados
      const followUp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          ...messages,
          firstChoice.message,
          ...toolResults.map(({ call, result }) => ({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          })),
        ],
        temperature: 0.5,
        max_tokens: 200,
      });

      answer = followUp.choices?.[0]?.message?.content?.trim() || "Feito.";
    } else {
      answer = firstChoice?.message?.content?.trim();
    }

    if (!answer) {
      return res.status(500).json({ error: "GPT returned empty response" });
    }

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
      action: actionResult,
      contexts: {
        memory:   hasContext,
        calendar: calendarBlock !== null,
        health:   !!healthContext,
        goals:    !!goalsContext,
        location: !!city,
        weather:  !!weatherLine,
      },
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
