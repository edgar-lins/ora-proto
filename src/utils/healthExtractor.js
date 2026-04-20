import { openai, toFile } from "./openaiClient.js";
import fs from "fs";

const EXAM_ANALYSIS_PROMPT = `Você é um assistente médico especializado em interpretação de exames laboratoriais.

Analise o exame fornecido e retorne um JSON com a seguinte estrutura:
{
  "exam_type": "tipo do exame (hemograma, bioquímica, urina, etc.)",
  "exam_date": "data do exame no formato YYYY-MM-DD ou null",
  "values": [
    {
      "name": "nome do marcador",
      "value": valor numérico ou string,
      "unit": "unidade",
      "reference_min": valor mínimo de referência ou null,
      "reference_max": valor máximo de referência ou null,
      "status": "normal | alto | baixo | atenção",
      "interpretation": "explicação curta e humana do que significa"
    }
  ],
  "summary": "resumo geral do exame em 2-3 frases, linguagem simples",
  "alerts": ["lista de achados que merecem atenção médica"],
  "positive": ["lista de resultados dentro do esperado para destacar"]
}

Regras importantes:
- Seja preciso com os valores — não invente números
- Use linguagem acessível, não jargão médico excessivo
- Sempre lembre que não substitui consulta médica
- Se não conseguir ler claramente algum valor, omita-o`;

/**
 * Analisa um exame a partir de uma imagem (base64) usando GPT-4o vision
 */
export async function analyzeExamImage(base64Image, mimeType = "image/jpeg") {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: EXAM_ANALYSIS_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
          {
            type: "text",
            text: "Analise este exame médico e retorne o JSON conforme solicitado.",
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  return parseExamResponse(response.choices?.[0]?.message?.content);
}

/**
 * Analisa um exame a partir de texto extraído de PDF
 */
export async function analyzeExamText(text) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: EXAM_ANALYSIS_PROMPT },
      {
        role: "user",
        content: `Analise este exame médico e retorne o JSON conforme solicitado.\n\n${text}`,
      },
    ],
    max_tokens: 2000,
  });

  return parseExamResponse(response.choices?.[0]?.message?.content);
}

/**
 * Analisa um PDF de exame enviando direto para o GPT-4o via Files API
 */
export async function analyzeExamPDF(filePath, fileName) {
  const fileStream = fs.createReadStream(filePath);
  const file = await toFile(fileStream, fileName, { type: "application/pdf" });

  const uploadedFile = await openai.files.create({
    file,
    purpose: "user_data",
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: EXAM_ANALYSIS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: { file_id: uploadedFile.id },
          },
          {
            type: "text",
            text: "Analise este exame médico e retorne o JSON conforme solicitado.",
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  await openai.files.delete(uploadedFile.id).catch(() => {});

  return parseExamResponse(response.choices?.[0]?.message?.content);
}

function parseExamResponse(raw) {
  if (!raw) throw new Error("Resposta vazia do GPT");
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Extrai métricas de saúde de um trecho de conversa (para auto-detecção na voz)
 */
export async function extractMetricsFromText(text) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Extraia métricas de saúde mencionadas no texto. Retorne JSON array ou [].
Tipos aceitos: weight (kg), height (cm), sleep_hours, workout_minutes, blood_pressure (mmHg), steps, water_ml, mood (1-10)
Exemplo: [{"type":"weight","value":110,"unit":"kg"},{"type":"sleep_hours","value":6,"unit":"h"}]
Extraia APENAS valores explicitamente mencionados. Retorne [] se não houver nada.`,
      },
      { role: "user", content: text },
    ],
  });

  try {
    const raw = response.choices?.[0]?.message?.content?.trim();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
