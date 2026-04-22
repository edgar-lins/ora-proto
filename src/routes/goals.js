import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * GET /api/v1/goals/:user_id
 * Lista metas ativas com tarefas de hoje e progresso geral
 */
router.get("/goals/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { rows: goals } = await pool.query(
      `SELECT * FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`,
      [user_id]
    );

    const result = await Promise.all(goals.map(async (goal) => {
      const [{ rows: allTasks }, { rows: stats }] = await Promise.all([
        pool.query(
          `SELECT * FROM goal_tasks WHERE goal_id = $1 AND date >= $2 ORDER BY date, type`,
          [goal.id, today]
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE completed) AS done, COUNT(*) AS total
           FROM goal_tasks WHERE goal_id = $1`,
          [goal.id]
        ),
      ]);

      // Agrupa tarefas por data
      const byDate = {};
      for (const task of allTasks) {
        const d = task.date.toISOString().slice(0, 10);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(task);
      }
      const tasks_by_date = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tasks]) => ({ date, tasks }));

      return {
        ...goal,
        today_tasks: byDate[today] ?? [],
        tasks_by_date,
        progress: { done: parseInt(stats[0].done), total: parseInt(stats[0].total) },
      };
    }));

    res.json({ status: "ok", goals: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/goals
 * Cria uma meta com tarefas geradas pela ORA
 */
router.post("/goals", async (req, res) => {
  const { user_id, title, description, target_description, deadline, tasks } = req.body;
  if (!user_id || !title || !tasks?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO goals (user_id, title, description, target_description, deadline)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, title, description, target_description, deadline || null]
    );
    const goal = rows[0];

    for (const task of tasks) {
      await pool.query(
        `INSERT INTO goal_tasks (goal_id, user_id, date, type, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [goal.id, user_id, task.date, task.type, task.description]
      );
    }

    res.json({ status: "ok", goal_id: goal.id, title: goal.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/v1/goals/tasks/:task_id/complete
 * Marca uma tarefa como concluída ou não
 */
router.patch("/goals/tasks/:task_id/complete", async (req, res) => {
  const { task_id } = req.params;
  const { completed = true } = req.body;

  try {
    await pool.query(
      `UPDATE goal_tasks SET completed = $1, completed_at = $2 WHERE id = $3`,
      [completed, completed ? new Date() : null, task_id]
    );
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/goals/:goal_id
 * Arquiva uma meta
 */
router.delete("/goals/:goal_id", async (req, res) => {
  const { goal_id } = req.params;
  try {
    await pool.query(`UPDATE goals SET status = 'archived' WHERE id = $1`, [goal_id]);
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
