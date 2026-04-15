import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import fetch from "node-fetch";
import { openai } from "../utils/openaiClient.js";

const router = express.Router();

// Upload em memória (até ~25MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * POST /api/v1/device/voice
 * Formato: multipart/form-data com:
 *  - field "audio": arquivo (.m4a, .mp3, .wav...)
 *  - field "user_id": UUID do usuário
 *  - (opcional) "language": pt, en, etc.
 */
router.post("/voice", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing 'audio' file" });
  }
  const { user_id, language } = req.body || {};
  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  // Salva o buffer em um arquivo temporário (compatível com SDK Node)
  const tmpPath = path.join(os.tmpdir(), `ora-audio-${Date.now()}-${req.file.originalname}`);
  try {
    await fs.promises.writeFile(tmpPath, req.file.buffer);

    // 1) Transcrição (tenta modelo novo; se não tiver acesso, cai pro whisper-1)
    const modelPrimary = process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
    let transcriptText = null;
    try {
      const resp = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: modelPrimary,
        ...(language ? { language } : {}),
      });
      transcriptText = resp.text || resp?.data?.text || null;
    } catch (e) {
      console.warn("Primary transcribe model failed, falling back to whisper-1:", e?.message || e);
      const resp2 = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: "whisper-1",
        ...(language ? { language } : {}),
      });
      transcriptText = resp2.text || resp2?.data?.text || null;
    }

    if (!transcriptText) {
      return res.status(500).json({ error: "Transcription failed: empty text" });
    }

    // 2) Persiste como memória manual, reaproveitando o pipeline existente (/device/event)
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const storeResp = await fetch(`${baseUrl}/api/v1/device/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        content: transcriptText,
        metadata: {
          source: "voice",
          original_filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          language: language || null,
        },
      }),
    });

    const storeJson = await storeResp.json();
    if (!storeResp.ok) {
      // Se o pipeline recusar (ex: texto muito curto), retornamos a transcrição mesmo assim
      return res.status(200).json({
        status: "transcribed",
        transcript: transcriptText,
        store_error: storeJson,
      });
    }

    // 3) Retorno final
    res.json({
      status: "ok",
      transcript: transcriptText,
      memory_id: storeJson.memory_id,
      summary: storeJson.summary,
      tags: storeJson.tags,
    });
  } catch (err) {
    console.error("❌ Voice route error:", err);
    res.status(500).json({ error: "Voice input failed", details: err.message });
  } finally {
    // limpeza do arquivo temporário
    fs.promises.unlink(tmpPath).catch(() => {});
  }
});

export default router;
