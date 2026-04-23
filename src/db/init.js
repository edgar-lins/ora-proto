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

    // Integrações OAuth por usuário (Google Calendar, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider)
      );
    `);

    // Métricas de saúde ao longo do tempo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS health_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        value NUMERIC,
        unit TEXT,
        notes TEXT,
        date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Exames médicos enviados pelo usuário
    await pool.query(`
      CREATE TABLE IF NOT EXISTS health_exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        exam_date DATE,
        exam_type TEXT,
        file_name TEXT,
        raw_text TEXT,
        analysis TEXT,
        values JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Log de análises proativas (controla frequência e histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proactive_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        should_notify BOOLEAN DEFAULT false,
        message TEXT,
        category TEXT,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Metas do usuário (perder peso, ganhar massa, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_description TEXT,
        deadline DATE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tarefas diárias vinculadas a uma meta
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goal_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        date DATE NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        calendar_event_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Migração: adiciona calendar_event_id se ainda não existe
    await pool.query(`
      ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
    `);

    console.log('✅ Tables created/updated successfully');
  } catch (err) {
    console.error('❌ Error initializing DB:', err);
  } finally {
    pool.end();
  }
}

init();
