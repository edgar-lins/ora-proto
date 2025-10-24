import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/v1/device/speak
 * body: { text: "...", voice?: "alloy" }
 * retorna áudio MP3
 */
router.post("/speak", async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    // caminho temporário para salvar o áudio
    const tmpPath = path.join(os.tmpdir(), `ora-tts-${Date.now()}.mp3`);

    // chama a API de TTS
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    // salva o buffer no disco temporário
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(tmpPath, buffer);

    // define headers de download
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ora-speak-${Date.now()}.mp3"`
    );

    // envia o arquivo
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);

    // remove o arquivo temporário depois de enviar
    stream.on("close", () => {
      fs.promises.unlink(tmpPath).catch(() => {});
    });
  } catch (err) {
    console.error("❌ TTS error:", err);
    res.status(500).json({ error: "Text-to-speech failed", details: err.message });
  }
});

export default router;
