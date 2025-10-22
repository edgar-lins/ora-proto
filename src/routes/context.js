import express from "express";
const router = express.Router();

/**
 * 🧠 POST /api/v1/device/context/reset
 * Reseta o contexto de conversa do usuário
 */
router.post("/context/reset", async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    // 🔮 Aqui futuramente limpamos cache, contexto, etc.
    console.log(`🧹 Contexto resetado para o usuário ${user_id}`);
    res.json({ status: "ok", message: "Context reset successfully" });
  } catch (err) {
    console.error("❌ Erro ao resetar contexto:", err);
    res.status(500).json({ error: "Context reset failed", details: err.message });
  }
});

export default router;
