import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { pool } from "../db/index.js";
import { openai } from "../utils/openaiClient.js";
import { getTodayEvents } from "../utils/calendarService.js";

const router = express.Router();

async function getHealthSummary(user_id) {
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
       ORDER BY created_at DESC LIMIT 3`,
      [user_id]
    ),
  ]);

  const parts = [];

  if (metricsRes.rows.length) {
    const metrics = metricsRes.rows
      .map((m) => `${m.type}: ${m.value} ${m.unit} (${new Date(m.date).toLocaleDateString("pt-BR")})`)
      .join(", ");
    parts.push(`Métricas: ${metrics}`);
  }

  if (examsRes.rows.length) {
    const exams = examsRes.rows.map((e) => {
      const date = e.exam_date
        ? new Date(e.exam_date).toLocaleDateString("pt-BR")
        : "data não informada";
      const data = typeof e.values === "string" ? JSON.parse(e.values) : e.values;

      const valueLines = data?.values?.length
        ? " Valores: " + data.values.map((v) => {
            const ref = (v.reference_min != null && v.reference_max != null)
              ? ` (ref: ${v.reference_min}–${v.reference_max})`
              : "";
            return `${v.name}: ${v.value} ${v.unit ?? ""}${ref} [${v.status ?? ""}]`;
          }).join(", ")
        : "";

      const alerts = data?.alerts?.length ? ` Alertas: ${data.alerts.join("; ")}` : "";
      return `${e.exam_type} (${date}): ${e.analysis}.${valueLines}${alerts}`;
    });
    parts.push(`Exames recentes: ${exams.join(" | ")}`);
  }

  return parts.length ? parts.join("\n") : null;
}

async function getRecentMemories(user_id) {
  const res = await pool.query(
    `SELECT content, created_at FROM memories
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 8`,
    [user_id]
  );
  return res.rows.map((r) => `- ${r.content}`).join("\n");
}

async function getLastInsights(user_id) {
  const res = await pool.query(
    `SELECT message, category, created_at FROM proactive_log
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 3`,
    [user_id]
  );
  return res.rows.map((r) => `[${r.category}] ${r.message}`).join("\n");
}

/**
 * GET /api/v1/device/briefing/:user_id
 * Gera e retorna o briefing matinal como áudio MP3.
 */
router.get("/briefing/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const voice = req.query.voice || "onyx";

  try {
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const [healthSummary, calendarEvents, recentMemories, lastInsights] = await Promise.all([
      getHealthSummary(user_id).catch(() => null),
      getTodayEvents(user_id).catch(() => null),
      getRecentMemories(user_id).catch(() => ""),
      getLastInsights(user_id).catch(() => ""),
    ]);

    const calendarBlock = calendarEvents === null
      ? "Agenda não conectada."
      : calendarEvents.length === 0
        ? "Agenda do dia está livre."
        : `Eventos de hoje:\n${calendarEvents.map((e) => `- ${e.summary || e.title} ${e.start?.dateTime ? "às " + new Date(e.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}`).join("\n")}`;

    const systemPrompt = `Você é ORA — assistente pessoal de Edgar Lins. Seu modelo é JARVIS: preciso, leal, levemente irônico, nunca genérico.

Agora você vai gerar o briefing matinal de Edgar. Fale como JARVIS falaria com Tony Stark pela manhã: narrativo, fluido, informativo. Chame-o de "sir" ou "Edgar".

Estrutura do briefing (adapte ao que tiver disponível, não force seções vazias):
1. Saudação com hora e dia da semana
2. Agenda do dia (se houver eventos)
3. Destaques de saúde (se houver dados relevantes ou alertas)
4. Uma observação proativa baseada nas memórias recentes (algo que ele mencionou e não concluiu, um padrão, um gap)
5. Encerramento curto e natural

NUNCA use markdown, listas com travessão, asteriscos ou hashtags. Escreva exatamente como falaria em voz alta.
Seja conciso: o briefing deve durar entre 30 e 60 segundos de fala. Não seja redundante.`;

    const userContent = [
      `Data/hora: ${now}`,
      `\n${calendarBlock}`,
      healthSummary ? `\nSaúde:\n${healthSummary}` : "",
      recentMemories ? `\nMemórias recentes de Edgar:\n${recentMemories}` : "",
      lastInsights ? `\nÚltimos insights já enviados a Edgar (não repetir):\n${lastInsights}` : "",
    ].filter(Boolean).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const briefingText = completion.choices[0].message.content.trim();

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: briefingText,
    });

    const tmpPath = path.join(os.tmpdir(), `ora-briefing-${Date.now()}.mp3`);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(tmpPath, buffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-ORA-Briefing", encodeURIComponent(briefingText));

    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on("close", () => fs.promises.unlink(tmpPath).catch(() => {}));

    console.log(`🌅 ORA briefing gerado para ${user_id}`);
  } catch (err) {
    console.error("❌ Briefing error:", err);
    res.status(500).json({ error: "Briefing failed", details: err.message });
  }
});

export default router;
