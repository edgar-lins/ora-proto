import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";
import { pool } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🎙️ POST /api/v1/device/speak/converse
 * Recebe áudio, transcreve, gera resposta e devolve a fala do ORA.
 */
router.post("/speak/converse", upload.single("audio"), async (req, res) => {
  try {
    const { user_id, voice = "alloy" } = req.body || {};
    const audioFile = req.file?.path;

    if (!user_id || !audioFile) {
      return res.status(400).json({ error: "Missing user_id or audio file" });
    }

    // 1️⃣ Transcreve o áudio (garantindo formato e path corretos)
    const originalPath = req.file.path;
    const fixedPath = path.join(os.tmpdir(), `${req.file.filename}.mp3`);

    try {
    // Adiciona extensão .mp3 para o Whisper reconhecer o MIME type
    await fs.promises.copyFile(originalPath, fixedPath);

    const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(fixedPath),
        model: "whisper-1",
        language: "pt",
    });

    var transcript = transcription.text.trim();
    console.log(`🎧 ORA ouviu: "${transcript}"`);

    // Limpa arquivos temporários
    await fs.promises.unlink(fixedPath).catch(() => {});
    await fs.promises.unlink(originalPath).catch(() => {});
    } catch (err) {
    console.error("⚠️ Erro ao transcrever áudio:", err);
    throw new Error("Falha na transcrição de áudio: " + err.message);
    }

    // 2️⃣ Gera resposta contextual usando o endpoint existente
    const contextResp = await fetch("http://localhost:3000/api/v1/device/context/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, query: transcript }),
    });

    const contextJson = await contextResp.json();
    const answerText =
      contextJson?.answer?.trim() || "Desculpe, não consegui entender direito.";

    // 3️⃣ Gera o áudio de resposta (TTS)
    const tmpPath = path.join(os.tmpdir(), `ora-converse-${Date.now()}.mp3`);
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: answerText,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(tmpPath, buffer);

    // 4️⃣ Salva no banco
    const id = uuidv4();
    await pool.query(
      `
      INSERT INTO memories (id, user_id, content, summary, type, metadata, voice_used, created_at)
      VALUES ($1, $2, $3, $4, 'auto', $5::jsonb, $6, NOW())
      `,
      [
        id,
        user_id,
        `Entrada de voz: ${transcript}\nResposta: ${answerText}`,
        answerText.slice(0, 100),
        JSON.stringify({ source: "speak/converse" }),
        voice,
      ]
    );

    // 5️⃣ Retorna o áudio da resposta
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename="ora-converse.mp3"`);
    res.setHeader("X-ORA-Transcript", encodeURIComponent(transcript));
    res.setHeader("X-ORA-Answer", encodeURIComponent(answerText));

    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);

    stream.on("close", () => {
      fs.promises.unlink(tmpPath).catch(() => {});
      fs.promises.unlink(audioFile).catch(() => {});
    });

    console.log(`🗣️ ORA respondeu: "${answerText}"`);
  } catch (err) {
    console.error("❌ speak/converse error:", err);
    res.status(500).json({ error: "Speak/converse failed", details: err.message });
  }
});

export default router;
