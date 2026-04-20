import express from "express";
import { getUpcomingEvents } from "../utils/calendarService.js";

const router = express.Router();

/**
 * GET /api/v1/calendar/upcoming/:user_id?minutes=30
 * Retorna eventos que começam nos próximos N minutos
 */
router.get("/calendar/upcoming/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const minutes = parseInt(req.query.minutes) || 30;

  try {
    const events = await getUpcomingEvents(user_id, minutes);

    const formatted = events.map((e) => {
      const start = e.start?.dateTime || e.start?.date;
      const startDate = new Date(start);
      const minutesUntil = Math.round((startDate - new Date()) / 60000);
      return {
        id: e.id,
        title: e.summary || "Sem título",
        start: startDate.toISOString(),
        minutesUntil,
        time: startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };
    });

    res.json({ status: "ok", events: formatted });
  } catch (err) {
    console.error("❌ Upcoming events error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
