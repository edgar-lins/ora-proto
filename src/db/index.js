import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

// Pool = gerenciador de conexões reutilizáveis
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
