import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";
import { pool } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/v1/device/speak/respond
 * Gera resposta contextual e retorna áudio MP3.
 */
router.post("/speak/respond", async (req, res) => {
  try {
    const { user_id, query, voice = "alloy" } = req.body || {};
    if (!user_id || !query) {
      return res.status(400).json({ error: "Missing user_id or query" });
    }

    // 1️⃣ chama o pipeline de contexto existente
    const contextResp = await fetch("http://localhost:3000/api/v1/device/context/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, query }),
    });

    const contextJson = await contextResp.json();
    if (!contextResp.ok || !contextJson.answer) {
      return res.status(500).json({
        error: "Failed to retrieve contextual response",
        details: contextJson,
      });
    }

    const answerText = contextJson.answer.trim();

    // 2️⃣ gera o áudio (TTS)
    const tmpPath = path.join(os.tmpdir(), `ora-tts-${Date.now()}.mp3`);
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: answerText,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(tmpPath, buffer);

    const id = uuidv4();
    await pool.query(
    `
    INSERT INTO memories (id, user_id, content, summary, type, metadata, voice_used, created_at)
    VALUES ($1, $2, $3, $4, 'auto', $5, $6, NOW())
    `,
    [
        id,
        user_id,
        `Pergunta: ${query}\nResposta falada: ${answerText}`,
        answerText.slice(0, 100),
        JSON.stringify({ source: "speak_respond" }),
        voice,
    ]);

    // 3️⃣ define headers e envia áudio + JSON
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ora-speak-${Date.now()}.mp3"`
    );

    // 🧠 adiciona metadados no header pra debug (opcional)
    res.setHeader("X-ORA-Answer", encodeURIComponent(answerText));

    // 4️⃣ envia o áudio em stream
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);

    stream.on("close", () => {
      fs.promises.unlink(tmpPath).catch(() => {});
    });

    // também loga no console pra debug
    console.log(`🎤 ORA respondeu e falou: "${answerText}"`);
  } catch (err) {
    console.error("❌ speak/respond error:", err);
    res.status(500).json({ error: "Speak/respond failed", details: err.message });
  }
});

export default router;
