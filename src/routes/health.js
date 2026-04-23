import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { pool } from "../db/index.js";
import {
  analyzeExamImage,
  analyzeExamPDF,
} from "../utils/healthExtractor.js";

const router = express.Router();
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ─── MÉTRICAS ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/health/metrics
 * Salva uma ou mais métricas de saúde
 */
router.post("/health/metrics", async (req, res) => {
  const { user_id, metrics } = req.body;
  if (!user_id || !metrics?.length)
    return res.status(400).json({ error: "Missing user_id or metrics" });

  try {
    for (const m of metrics) {
      await pool.query(
        `INSERT INTO health_metrics (user_id, type, value, unit, notes, date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
        [user_id, m.type, m.value, m.unit, m.notes || null]
      );
    }
    res.json({ status: "ok", saved: metrics.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/health/sync
 * Recebe snapshot do HealthKit (Apple Watch) e persiste.
 */
router.post("/health/sync", async (req, res) => {
  const {
    user_id,
    sleep_minutes,
    resting_hr,
    hrv_ms,
    steps_today,
    active_calories_today,
    weight_kg,
    recent_workouts,
  } = req.body;

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    await pool.query(
      `INSERT INTO healthkit_snapshots
         (user_id, sleep_minutes, resting_hr, hrv_ms, steps_today,
          active_calories_today, weight_kg, recent_workouts, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        user_id,
        sleep_minutes ?? null,
        resting_hr ?? null,
        hrv_ms ?? null,
        steps_today ?? null,
        active_calories_today ?? null,
        weight_kg ?? null,
        recent_workouts ? JSON.stringify(recent_workouts) : null,
      ]
    );

    // Mantém apenas os últimos 30 snapshots por usuário
    await pool.query(
      `DELETE FROM healthkit_snapshots WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM healthkit_snapshots WHERE user_id = $1
         ORDER BY synced_at DESC LIMIT 30
       )`,
      [user_id]
    );

    console.log(`⌚ HealthKit sync [${user_id}]: sono=${sleep_minutes}min, HRV=${hrv_ms}ms, FC=${resting_hr}bpm`);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ HealthKit sync error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/metrics/:user_id
 * Retorna histórico de métricas por tipo
 */
router.get("/health/metrics/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const { type } = req.query;

  try {
    const query = type
      ? `SELECT * FROM health_metrics WHERE user_id = $1 AND type = $2 ORDER BY date DESC LIMIT 90`
      : `SELECT * FROM health_metrics WHERE user_id = $1 ORDER BY date DESC LIMIT 90`;

    const params = type ? [user_id, type] : [user_id];
    const { rows } = await pool.query(query, params);
    res.json({ status: "ok", metrics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXAMES ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/health/exams
 * Recebe imagem ou PDF de exame, analisa com GPT-4o e salva
 */
router.post("/health/exams", upload.single("file"), async (req, res) => {
  const { user_id } = req.body;
  const file = req.file;

  if (!user_id || !file)
    return res.status(400).json({ error: "Missing user_id or file" });

  try {
    const ext = path.extname(file.originalname).toLowerCase();
    let analysis;

    if (ext === ".pdf") {
      analysis = await analyzeExamPDF(file.path, file.originalname);
    } else {
      const buffer = fs.readFileSync(file.path);
      const base64 = buffer.toString("base64");
      const mime = file.mimetype || "image/jpeg";
      analysis = await analyzeExamImage(base64, mime);
    }

    const examDate = analysis.exam_date || null;

    const { rows } = await pool.query(
      `INSERT INTO health_exams (user_id, exam_date, exam_type, file_name, analysis, values)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        user_id,
        examDate,
        analysis.exam_type || "exame",
        file.originalname,
        analysis.summary,
        JSON.stringify({
          values: analysis.values,
          alerts: analysis.alerts,
          positive: analysis.positive,
        }),
      ]
    );

    fs.unlink(file.path, () => {});

    console.log(`🔬 Exame analisado [${user_id}]: ${analysis.exam_type} — ${analysis.alerts?.length || 0} alertas`);

    res.json({
      status: "ok",
      exam_id: rows[0].id,
      exam_type: analysis.exam_type,
      summary: analysis.summary,
      alerts: analysis.alerts || [],
      positive: analysis.positive || [],
      values: analysis.values || [],
    });
  } catch (err) {
    console.error("❌ Exam analysis error:", err.message);
    fs.unlink(file?.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/exams/:user_id
 * Lista exames do usuário
 */
router.get("/health/exams/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, exam_date, exam_type, file_name, analysis, values, created_at
       FROM health_exams WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [user_id]
    );
    res.json({ status: "ok", exams: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
