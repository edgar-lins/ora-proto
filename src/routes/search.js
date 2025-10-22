import express from "express";
import { pool } from "../db/index.js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const router = express.Router();

// Função para gerar embedding da consulta
async function generateEmbedding(text) {
    try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        },
        body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        console.error("❌ Embedding API error:", data);
        throw new Error(data.error?.message || "Failed to generate embedding");
    }

    if (!data?.data?.[0]?.embedding) {
        console.error("❌ Unexpected embedding format:", data);
        throw new Error("Invalid embedding response format");
    }

    return data.data[0].embedding; 
    } catch (err) {
    console.error("⚠️ generateEmbedding failed:", err);
    throw err;
    }
}


// Similaridade de cosseno (mede o quão parecidos dois vetores são)
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
}

// Rota de busca semântica
router.post("/search", async (req, res) => {
    try {
    const { user_id, query } = req.body;
    if (!user_id || !query) {
        return res.status(400).json({ error: "Missing user_id or query" });
    }

    // Gera o embedding da consulta
    const queryEmbedding = await generateEmbedding(query);

    // Busca todas as memórias do usuário
    const result = await pool.query(
        "SELECT id, content, embedding FROM memories WHERE user_id = $1",
        [user_id]
    );

    // Calcula similaridade de cosseno entre a consulta e cada memória
    const validMemories = result.rows.filter(row => Array.isArray(row.embedding));

    if (validMemories.length === 0) {
        return res.status(404).json({ message: "No valid memories with embeddings found." });
    }

    const scored = validMemories.map((row) => ({
        id: row.id,
        content: row.content,
        similarity: cosineSimilarity(queryEmbedding, row.embedding),
    }));


    // Ordena do mais semelhante pro menos
    scored.sort((a, b) => b.similarity - a.similarity);

    res.json({
        query,
        top_results: scored.slice(0, 5), // retorna só os 5 mais relevantes
    });
    } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed", details: err.message });
    }
});

export default router;
