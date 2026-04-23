import { pool } from "../db/index.js";

/**
 * Detecta ações pendentes que merecem notificação com botão.
 * Cada detector é determinístico — sem GPT, só dados.
 * Retorna array de { type, ref_id, message, category, action_data }
 */
export async function detectPendingActions(user_id) {
  const results = await Promise.allSettled([
    detectOverdueTasks(user_id),
    detectBrokenStreak(user_id),
  ]);

  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value]))
    .filter(Boolean);
}

// Tarefas atrasadas de 1 a 3 dias — pergunta se foi feita
async function detectOverdueTasks(user_id) {
  const { rows } = await pool.query(
    `SELECT t.id, t.description, t.type, t.date, g.title AS goal_title
     FROM goal_tasks t
     JOIN goals g ON g.id = t.goal_id
     WHERE t.user_id = $1
       AND t.completed = false
       AND t.date < CURRENT_DATE
       AND t.date >= CURRENT_DATE - INTERVAL '3 days'
     ORDER BY t.date ASC
     LIMIT 3`,
    [user_id]
  );

  if (!rows.length) return [];

  // Filtra as que já foram notificadas nas últimas 20h
  const recent = await pool.query(
    `SELECT ref_id FROM proactive_action_log
     WHERE user_id = $1 AND action_type = 'overdue_task'
       AND sent_at > NOW() - INTERVAL '20 hours'`,
    [user_id]
  );
  const notifiedIds = new Set(recent.rows.map((r) => r.ref_id));

  return rows
    .filter((t) => !notifiedIds.has(t.id))
    .map((t) => {
      const dayDiff = Math.round((Date.now() - new Date(t.date).getTime()) / 86400000);
      const when = dayDiff === 1 ? "ontem" : `há ${dayDiff} dias`;
      return {
        type: "overdue_task",
        ref_id: t.id,
        message: `Você fez "${t.description}" ${when}?`,
        category: "ora_task",
        action_data: { task_id: t.id, goal_title: t.goal_title },
      };
    });
}

// 2+ treinos perdidos consecutivos nos últimos 5 dias
async function detectBrokenStreak(user_id) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS missed
     FROM goal_tasks
     WHERE user_id = $1
       AND type = 'treino'
       AND completed = false
       AND date < CURRENT_DATE
       AND date >= CURRENT_DATE - INTERVAL '5 days'`,
    [user_id]
  );

  const missed = parseInt(rows[0].missed);
  if (missed < 2) return null;

  // Não notifica se já enviou nos últimos 2 dias
  const { rows: recent } = await pool.query(
    `SELECT id FROM proactive_action_log
     WHERE user_id = $1 AND action_type = 'broken_streak'
       AND sent_at > NOW() - INTERVAL '48 hours'`,
    [user_id]
  );
  if (recent.length) return null;

  return {
    type: "broken_streak",
    ref_id: `streak_${user_id}`,
    message: `Você perdeu ${missed} treino${missed > 1 ? "s" : ""} nos últimos dias. Quer que eu reorganize essa semana?`,
    category: "ora_confirm",
    action_data: { missed_count: missed },
  };
}

/**
 * Executa a ação escolhida pelo usuário após tocar no botão da notificação.
 * response: 'done' | 'skip' | 'postpone' | 'yes' | 'no'
 */
export async function executeAction(user_id, action_type, action_data, response) {
  // Registra a resposta
  await pool.query(
    `INSERT INTO proactive_action_log (user_id, action_type, ref_id, response)
     VALUES ($1, $2, $3, $4)`,
    [user_id, action_type, action_data?.task_id ?? action_data?.ref_id ?? null, response]
  );

  switch (action_type) {
    case "overdue_task": {
      const { task_id } = action_data;
      if (response === "done") {
        await pool.query(
          `UPDATE goal_tasks SET completed = true, completed_at = NOW() WHERE id = $1`,
          [task_id]
        );
        return { ok: true, message: "Tarefa marcada como concluída." };
      }
      if (response === "skip") {
        return { ok: true, message: "Entendido. Seguimos em frente." };
      }
      if (response === "postpone") {
        await pool.query(
          `UPDATE goal_tasks SET date = CURRENT_DATE WHERE id = $1`,
          [task_id]
        );
        return { ok: true, message: "Tarefa movida para hoje." };
      }
      break;
    }

    case "broken_streak": {
      if (response === "yes") {
        // Move todas as tarefas de treino perdidas para os próximos dias disponíveis
        const { rows: missed } = await pool.query(
          `SELECT id FROM goal_tasks
           WHERE user_id = $1 AND type = 'treino' AND completed = false
             AND date < CURRENT_DATE
           ORDER BY date ASC`,
          [user_id]
        );

        for (let i = 0; i < missed.length; i++) {
          const newDate = new Date();
          newDate.setDate(newDate.getDate() + i + 1);
          const dateStr = newDate.toISOString().slice(0, 10);
          await pool.query(
            `UPDATE goal_tasks SET date = $1 WHERE id = $2`,
            [dateStr, missed[i].id]
          );
        }
        return { ok: true, message: `${missed.length} treino${missed.length > 1 ? "s" : ""} reagendado${missed.length > 1 ? "s" : ""} para os próximos dias.` };
      }
      return { ok: true, message: "Ok." };
    }

    default:
      return { ok: false, error: "Tipo de ação desconhecido" };
  }

  return { ok: true };
}
