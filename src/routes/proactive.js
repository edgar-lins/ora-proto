import express from "express";
import { analyzeAndSuggest } from "../utils/proactiveEngine.js";
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

export default router;
