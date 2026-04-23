import express from "express";
import { analyzeAndSuggest } from "../utils/proactiveEngine.js";
import { detectPendingActions, executeAction } from "../utils/proactiveActions.js";
import { pool } from "../db/index.js";

const router = express.Router();

// Intervalo mínimo entre análises por usuário (2 horas)
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * POST /api/v1/proactive/check/:user_id
 * Roda a análise proativa e retorna uma sugestão se houver.
 * Respeita o intervalo mínimo para não spammar o usuário.
 */
router.get("/proactive/check/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const force = req.query.force === "true";

  try {
    // Verifica quando foi a última análise
    const { rows } = await pool.query(
      `SELECT created_at FROM proactive_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (!force && rows.length) {
      const lastRun = new Date(rows[0].created_at).getTime();
      const elapsed = Date.now() - lastRun;
      if (elapsed < MIN_INTERVAL_MS) {
        return res.json({ should_notify: false, reason: "too_soon" });
      }
    }

    const { shouldNotify, message, category, reason } = await analyzeAndSuggest(user_id);

    // Registra a análise independente do resultado
    await pool.query(
      `INSERT INTO proactive_log (user_id, should_notify, message, category, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, shouldNotify, message, category, reason]
    );

    console.log(`🧠 Proactive [${user_id}]: ${shouldNotify ? `✅ "${message}"` : `⏭ ${reason}`}`);

    res.json({ should_notify: shouldNotify, message, category });
  } catch (err) {
    console.error("❌ Proactive check error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/proactive/insight/:user_id
 * Retorna o insight pendente mais recente (se houver) e o marca como entregue.
 */
router.get("/proactive/insight/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, content, created_at
       FROM memories
       WHERE user_id = $1
         AND type = 'insight'
         AND (metadata->>'delivered') IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (!rows.length) return res.json({ insight: null });

    const insight = rows[0];

    // Marca como entregue
    await pool.query(
      `UPDATE memories
       SET metadata = metadata || '{"delivered": true}'
       WHERE id = $1`,
      [insight.id]
    );

    res.json({ insight: insight.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/proactive/actions/:user_id
 * Retorna ações pendentes que merecem notificação com botão de resposta.
 */
router.get("/proactive/actions/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const actions = await detectPendingActions(user_id);

    // Registra as ações detectadas no log (sem resposta ainda)
    for (const action of actions) {
      await pool.query(
        `INSERT INTO proactive_action_log (user_id, action_type, ref_id, sent_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [user_id, action.type, action.ref_id]
      ).catch(() => {});
    }

    res.json({ actions });
  } catch (err) {
    console.error("❌ Proactive actions error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/proactive/execute
 * Executa a ação escolhida pelo usuário (botão da notificação).
 */
router.post("/proactive/execute", async (req, res) => {
  const { user_id, action_type, action_data, response } = req.body;
  if (!user_id || !action_type || !response) {
    return res.status(400).json({ error: "Missing user_id, action_type or response" });
  }
  try {
    const result = await executeAction(user_id, action_type, action_data, response);
    console.log(`⚡ Action [${user_id}] ${action_type} → ${response}: ${result.message ?? result.error}`);
    res.json(result);
  } catch (err) {
    console.error("❌ Proactive execute error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
