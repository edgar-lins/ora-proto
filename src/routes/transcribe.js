import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { openai } from "../utils/openaiClient.js";

const router = express.Router();
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".m4a";
    cb(null, `ora-wake-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

/**
 * POST /api/v1/device/transcribe
 * Transcreve áudio e retorna apenas o texto. Usado para detecção de wake word.
 */
router.post("/transcribe", upload.single("audio"), async (req, res) => {
  const audioFile = req.file;
  if (!audioFile) return res.status(400).json({ error: "Missing audio" });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.path),
      model: "whisper-1",
      response_format: "json",
      language: "pt",
    });

    res.json({ text: transcription.text?.trim() ?? "" });
  } catch (err) {
    console.error("❌ Transcribe error:", err);
    res.status(500).json({ error: "Transcription failed" });
  } finally {
    fs.promises.unlink(audioFile.path).catch(() => {});
  }
});

export default router;
