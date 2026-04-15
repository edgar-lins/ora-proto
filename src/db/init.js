import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  try {
    // Extensão para geração de UUIDs
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Tabela principal de memórias
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        metadata JSONB,
        embedding JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Colunas adicionadas após a criação inicial — seguro rodar em banco existente
    await pool.query(`ALTER TABLE memories ADD COLUMN IF NOT EXISTS tags TEXT[];`);
    await pool.query(`ALTER TABLE memories ADD COLUMN IF NOT EXISTS type TEXT;`);
    await pool.query(`ALTER TABLE memories ADD COLUMN IF NOT EXISTS voice_used TEXT;`);

    // Histórico de conversa (mantém as últimas N trocas por usuário)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Log de conversas para auditoria/análise
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        query TEXT,
        answer TEXT,
        memories_used JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Tables created/updated successfully');
  } catch (err) {
    console.error('❌ Error initializing DB:', err);
  } finally {
    pool.end();
  }
}

init();
