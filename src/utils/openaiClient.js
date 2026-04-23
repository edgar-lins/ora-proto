import OpenAI, { toFile } from "openai";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("⚠️  OPENAI_API_KEY not set — process.env keys:", Object.keys(process.env).filter(k => k.startsWith("OPENAI") || k.startsWith("DATABASE")));
}

export const openai = new OpenAI({ apiKey: apiKey ?? "missing" });
export { toFile };
