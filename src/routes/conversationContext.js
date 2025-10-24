import express from "express";
import { pool } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * 📦 POST /api/v1/conversation/save
 * Salva uma fala do usuário e da IA no histórico de curto prazo
 */
router.post("/conversation/save", async (req, res) => {
  try {
    const { user_id, role, content } = req.body;

    if (!user_id || !role || !content) {
      return res.status(400).json({ error: "Missing user_id, role or content" });
    }

    const id = uuidv4();

    await pool.query(
      `
      INSERT INTO conversation_history (id, user_id, role, content, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [id, user_id, role, content]
    );

    // Mantém apenas as 5 mais recentes
    await pool.query(
      `
      DELETE FROM conversation_history
      WHERE id NOT IN (
        SELECT id FROM conversation_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      )
      AND user_id = $1
      `,
      [user_id]
    );

    res.json({ status: "ok", message: "Mensagem registrada no histórico." });
  } catch (err) {
    console.error("❌ Erro ao salvar contexto:", err);
    res.status(500).json({ error: "Falha ao salvar contexto", details: err.message });
  }
});

/**
 * 🧠 GET /api/v1/conversation/context/:user_id
 * Retorna as últimas 5 falas do histórico do usuário
 */
router.get("/conversation/context/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    const { rows } = await pool.query(
      `
      SELECT role, content, created_at
      FROM conversation_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [user_id]
    );

    res.json({ status: "ok", context: rows.reverse() }); // mais antigo primeiro
  } catch (err) {
    console.error("❌ Erro ao buscar contexto:", err);
    res.status(500).json({ error: "Falha ao buscar contexto", details: err.message });
  }
});

export default router;
