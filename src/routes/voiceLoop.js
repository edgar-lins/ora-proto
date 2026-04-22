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
import { generateEmbedding } from "../utils/math.js";

async function extractAndSaveFacts(user_id, transcript, answer, date) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: `Você extrai fatos pessoais relevantes de conversas para construir um perfil duradouro do usuário.

Retorne APENAS um array JSON de strings. Cada string é um fato limpo, conciso e datado.
Extraia apenas informações novas e pessoalmente relevantes:
- Saúde, sintomas, hábitos, energia, sono
- Objetivos, planos, intenções declaradas
- Preferências, rotinas, características pessoais
- Estado emocional ou situações de vida importantes
- Trabalho, projetos, conquistas mencionadas

Se não houver nada relevante, retorne [].
NÃO extraia: perguntas genéricas, respostas factuais sem contexto pessoal, repetições óbvias.

Exemplos corretos:
["Edgar relatou dificuldade para dormir (${date})", "Edgar quer treinar 3x por semana", "Edgar está estressado com projeto de trabalho (${date})"]`,
      },
      {
        role: "user",
        content: `Usuário disse: ${transcript}\nORA respondeu: ${answer}`,
      },
    ],
  });

  let facts = [];
  try {
    const raw = completion.choices[0].message.content.trim();
    facts = JSON.parse(raw);
  } catch {
    return;
  }

  if (!Array.isArray(facts) || facts.length === 0) return;

  for (const fact of facts) {
    if (typeof fact !== "string" || fact.length < 10) continue;
    const embedding = await generateEmbedding(fact);
    await pool.query(
      `INSERT INTO memories (id, user_id, content, summary, type, metadata, embedding, created_at)
       VALUES ($1, $2, $3, $4, 'fact', $5, $6, NOW())`,
      [
        uuidv4(),
        user_id,
        fact,
        fact.slice(0, 100),
        JSON.stringify({ source: "fact-extraction" }),
        JSON.stringify(embedding),
      ]
    );
  }

  if (facts.length) console.log(`🧠 Fatos extraídos [${user_id}]:`, facts);
}

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
    const { user_id, voice = "onyx", city = null } = req.body || {};
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
      body: JSON.stringify({ user_id, query: transcript, city }),
    });

    const contextJson = await contextResp.json();
    if (!contextResp.ok || !contextJson.answer) {
      return res.status(500).json({
        error: "Context response failed",
        details: contextJson,
      });
    }

    const answer = contextJson.answer.trim();
    const actionResult = contextJson.action ?? null;
    const contexts = contextJson.contexts ?? null;
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

    // 4️⃣ Salva memória bruta + métricas + extrai fatos limpos (background)
    const memoryText = `Usuário disse: ${transcript}\nORA respondeu: ${answer}`;
    const now = new Date().toLocaleDateString("pt-BR");

    const [, metrics] = await Promise.all([
      pool.query(
        `INSERT INTO memories (id, user_id, content, summary, type, metadata, created_at)
         VALUES ($1, $2, $3, $4, 'auto', $5, NOW())`,
        [uuidv4(), user_id, memoryText, answer.slice(0, 100), JSON.stringify({ source: "voice-loop" })]
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

    // Extração de fatos relevantes em background (não bloqueia a resposta)
    extractAndSaveFacts(user_id, transcript, answer, now).catch(() => {});

    // 5️⃣ Envia resposta em stream de áudio (voz)
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename="ora-voice-${Date.now()}.mp3"`);
    res.setHeader("X-ORA-Answer", encodeURIComponent(answer));
    res.setHeader("X-ORA-Transcript", encodeURIComponent(transcript));
    if (actionResult) res.setHeader("X-ORA-Action", encodeURIComponent(JSON.stringify(actionResult)));
    if (contexts)     res.setHeader("X-ORA-Context", encodeURIComponent(JSON.stringify(contexts)));

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
