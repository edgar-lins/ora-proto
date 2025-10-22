import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    console.log('✅ Tables created successfully');
  } catch (err) {
    console.error('❌ Error initializing DB:', err);
  } finally {
    pool.end();
  }
}

init();
