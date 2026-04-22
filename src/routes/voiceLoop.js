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
import { generateEmbedding, cosineSimilarity } from "../utils/math.js";
import { analyzeAndSuggest } from "../utils/proactiveEngine.js";

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

  // Carrega embeddings de fatos existentes para deduplicação
  const { rows: existingFacts } = await pool.query(
    `SELECT id, content, embedding FROM memories
     WHERE user_id = $1 AND type = 'fact' AND embedding IS NOT NULL`,
    [user_id]
  );

  const parsed = existingFacts.map((m) => {
    try { return { id: m.id, emb: JSON.parse(m.embedding) }; } catch { return null; }
  }).filter(Boolean);

  let inserted = 0, updated = 0;

  for (const fact of facts) {
    if (typeof fact !== "string" || fact.length < 10) continue;
    const embedding = await generateEmbedding(fact);

    // Verifica se já existe fato muito similar (threshold 0.82)
    const duplicate = parsed.find((m) => cosineSimilarity(embedding, m.emb) > 0.82);

    if (duplicate) {
      // Atualiza o existente com o conteúdo mais recente
      await pool.query(
        `UPDATE memories SET content = $1, summary = $2, embedding = $3, created_at = NOW()
         WHERE id = $4`,
        [fact, fact.slice(0, 100), JSON.stringify(embedding), duplicate.id]
      );
      // Atualiza cache local para próximos fatos do mesmo batch
      duplicate.emb = embedding;
      updated++;
    } else {
      await pool.query(
        `INSERT INTO memories (id, user_id, content, summary, type, metadata, embedding, created_at)
         VALUES ($1, $2, $3, $4, 'fact', $5, $6, NOW())`,
        [uuidv4(), user_id, fact, fact.slice(0, 100),
         JSON.stringify({ source: "fact-extraction" }), JSON.stringify(embedding)]
      );
      parsed.push({ id: uuidv4(), emb: embedding });
      inserted++;
    }
  }

  if (inserted + updated > 0)
    console.log(`🧠 Fatos [${user_id}]: ${inserted} novos, ${updated} atualizados`);
}

// Intervalo mínimo entre análises proativas por usuário (2h)
const proactiveLastRun = new Map();

async function runProactiveCheck(user_id) {
  const last = proactiveLastRun.get(user_id) ?? 0;
  if (Date.now() - last < 2 * 60 * 60 * 1000) return;
  proactiveLastRun.set(user_id, Date.now());

  const { shouldNotify, message, category, reason } = await analyzeAndSuggest(user_id);

  await pool.query(
    `INSERT INTO proactive_log (user_id, should_notify, message, category, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [user_id, shouldNotify, message, category, reason]
  );

  if (shouldNotify && message) {
    console.log(`🧠 Proactive insight [${user_id}]: "${message}"`);
    // Salva como insight pendente para o mobile buscar
    await pool.query(
      `INSERT INTO memories (id, user_id, content, summary, type, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'insight', $4, NOW())`,
      [user_id, message, message.slice(0, 100), JSON.stringify({ source: "proactive", category })]
    );
  }
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
    const { user_id, voice = "onyx", city = null, checkin_task_id = null, checkin_description = null } = req.body || {};
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
    const extraContext = checkin_task_id
      ? `TAREFA PARA CHECAR: "${checkin_description}" (task_id: ${checkin_task_id}). O usuário está respondendo se conseguiu completar essa tarefa. Se confirmar, chame complete_task com esse task_id.`
      : null;

    const contextResp = await fetch(`${baseUrl}/api/v1/device/context/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, query: transcript, city, extra_context: extraContext }),
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
      ).then(() =>
        // Mantém apenas as últimas 30 memórias 'auto' — o resto é ruído
        pool.query(
          `DELETE FROM memories WHERE user_id = $1 AND type = 'auto'
           AND id NOT IN (
             SELECT id FROM memories WHERE user_id = $1 AND type = 'auto'
             ORDER BY created_at DESC LIMIT 30
           )`,
          [user_id]
        )
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

    // Análise proativa em background — dispara 30s após a conversa
    setTimeout(() => {
      runProactiveCheck(user_id).catch(() => {});
    }, 30_000);

    // Consolidação automática de memórias — dispara quando fatos > 40
    pool.query(
      `SELECT COUNT(*) FROM memories WHERE user_id = $1 AND type = 'fact'`,
      [user_id]
    ).then(({ rows }) => {
      if (parseInt(rows[0].count) > 40) {
        const baseUrl = process.env.BASE_URL || "http://localhost:3000";
        fetch(`${baseUrl}/api/v1/memory/consolidate/${encodeURIComponent(user_id)}`, { method: "POST" })
          .catch(() => {});
      }
    }).catch(() => {});

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
