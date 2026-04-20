import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import fetch from "node-fetch";
import { openai } from "../utils/openaiClient.js";
import { pool } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";
import { extractMetricsFromText } from "../utils/healthExtractor.js";

const router = express.Router();
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3";
    cb(null, `ora-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

/**
 * POST /api/v1/voice/loop
 * Recebe áudio → transcreve → gera resposta contextual → responde com voz
 */
router.post("/voice/loop", upload.single("audio"), async (req, res) => {
  try {
    const { user_id, voice = "alloy" } = req.body || {};
    const audioFile = req.file;

    if (!user_id || !audioFile) {
      return res.status(400).json({ error: "Missing user_id or audio file" });
    }

    // 1️⃣ Transcreve o áudio
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.path),
      model: "whisper-1",
      response_format: "json",
    });

    const transcript = transcription.text?.trim();
    console.log(`🎧 Transcrição: ${transcript}`);

    if (!transcript) {
      return res.status(400).json({ error: "Transcription failed" });
    }

    // 2️⃣ Gera resposta contextual usando o pipeline existente
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const contextResp = await fetch(`${baseUrl}/api/v1/device/context/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, query: transcript }),
    });

    const contextJson = await contextResp.json();
    if (!contextResp.ok || !contextJson.answer) {
      return res.status(500).json({
        error: "Context response failed",
        details: contextJson,
      });
    }

    const answer = contextJson.answer.trim();
    console.log(`💬 ORA respondeu: ${answer}`);

    // 3️⃣ Gera voz da resposta
    const tmpAudioPath = path.join(os.tmpdir(), `ora-voice-${Date.now()}.mp3`);
    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: answer,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    await fs.promises.writeFile(tmpAudioPath, buffer);

    // 4️⃣ Salva memória automática + detecta métricas de saúde em paralelo
    const memoryText = `Usuário disse: ${transcript}\nORA respondeu: ${answer}`;
    const id = uuidv4();

    const [, metrics] = await Promise.all([
      pool.query(
        `INSERT INTO memories (id, user_id, content, summary, type, metadata, created_at)
         VALUES ($1, $2, $3, $4, 'auto', $5, NOW())`,
        [id, user_id, memoryText, answer.slice(0, 100), { source: "voice-loop" }]
      ),
      extractMetricsFromText(transcript),
    ]);

    if (metrics.length) {
      for (const m of metrics) {
        await pool.query(
          `INSERT INTO health_metrics (user_id, type, value, unit, date)
           VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
          [user_id, m.type, m.value, m.unit]
        );
      }
      console.log(`📊 Métricas detectadas [${user_id}]:`, metrics);
    }

    // 5️⃣ Envia resposta em stream de áudio (voz)
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ora-voice-${Date.now()}.mp3"`
    );
    res.setHeader("X-ORA-Answer", encodeURIComponent(answer));

    const stream = fs.createReadStream(tmpAudioPath);
    stream.pipe(res);
    stream.on("close", () => fs.promises.unlink(tmpAudioPath).catch(() => {}));

    console.log("✅ Loop de voz completo com sucesso!");
  } catch (err) {
    console.error("❌ Erro no voice/loop:", err);
    res.status(500).json({
      error: "Speak/converse failed",
      details: err.message,
    });
  }
});

export default router;
