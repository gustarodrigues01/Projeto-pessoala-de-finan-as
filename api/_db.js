import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

if (!process.env.DATABASE_URL) {
  throw new Error('A variável DATABASE_URL não foi configurada no Vercel.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000
});

attachDatabasePool(pool);

let schemaReady;
export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id CHAR(32) PRIMARY KEY,
          email VARCHAR(254) NOT NULL UNIQUE,
          password_salt CHAR(32) NOT NULL,
          password_hash BYTEA NOT NULL,
          created_at VARCHAR(30) NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash CHAR(64) PRIMARY KEY,
          user_id CHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_state (
          user_id CHAR(32) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          state_json TEXT NOT NULL,
          updated_at VARCHAR(30) NOT NULL
        )
      `);
    })().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export { pool };
