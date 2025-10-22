import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * 🔍 GET /api/v1/memories
 * Lista as memórias salvas para um usuário
 * Query params:
 *  - user_id (obrigatório)
 *  - q (opcional): filtro por texto
 */
router.get("/memories", async (req, res) => {
  const { user_id, q } = req.query;
  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  try {
    let sql = "SELECT id, summary, content, created_at FROM memories WHERE user_id = $1";
    const params = [user_id];

    if (q) {
      sql += " AND content ILIKE $2";
      params.push(`%${q}%`);
    }

    sql += " ORDER BY created_at DESC LIMIT 50";
    const result = await pool.query(sql, params);
    res.json({ count: result.rowCount, memories: result.rows });
  } catch (err) {
    console.error("❌ Erro ao listar memórias:", err);
    res.status(500).json({ error: "Memory listing failed", details: err.message });
  }
});

/**
 * 🧹 DELETE /api/v1/memories/:id
 * Remove uma memória específica
 */
router.delete("/memories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM memories WHERE id = $1", [id]);
    res.json({ status: "ok", deleted_id: id });
  } catch (err) {
    console.error("❌ Erro ao deletar memória:", err);
    res.status(500).json({ error: "Memory deletion failed", details: err.message });
  }
});

export default router;
