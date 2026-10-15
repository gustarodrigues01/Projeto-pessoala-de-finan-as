import mariadb from 'mariadb';
import pg from 'pg';

const { Pool } = pg;
const targetUrl = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!targetUrl) {
  console.error('Adicione PG_DATABASE_URL ao .env com a URL do PostgreSQL de destino.');
  process.exit(1);
}

const source = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'familia_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'familia_prospera',
  connectionLimit: 2,
  connectTimeout: 10000
});
const target = new Pool({ connectionString: targetUrl, max: 2, connectionTimeoutMillis: 10000 });

try {
  const [users, sessions, states, existing] = await Promise.all([
    source.query('SELECT id, email, password_salt, password_hash, created_at FROM users'),
    source.query('SELECT token_hash, user_id, expires_at FROM sessions'),
    source.query('SELECT user_id, state_json, updated_at FROM user_state'),
    target.query("SELECT to_regclass('public.users') AS table_name")
  ]);

  await target.query(`CREATE TABLE IF NOT EXISTS users (
    id CHAR(32) PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_salt CHAR(32) NOT NULL,
    password_hash BYTEA NOT NULL,
    created_at VARCHAR(30) NOT NULL
  )`);
  await target.query(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id CHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  )`);
  await target.query(`CREATE TABLE IF NOT EXISTS user_state (
    user_id CHAR(32) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL,
    updated_at VARCHAR(30) NOT NULL
  )`);

  const count = existing.rows[0].table_name
    ? Number((await target.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count)
    : 0;
  if (count > 0) {
    throw new Error('O PostgreSQL de destino já tem usuários. Para evitar sobrescrever dados, a migração foi cancelada.');
  }

  await target.query('BEGIN');
  for (const user of users) {
    await target.query('INSERT INTO users(id, email, password_salt, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
      user.id, user.email, user.password_salt, user.password_hash, user.created_at
    ]);
  }
  for (const session of sessions) {
    await target.query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      session.token_hash, session.user_id, session.expires_at
    ]);
  }
  for (const state of states) {
    await target.query('INSERT INTO user_state(user_id, state_json, updated_at) VALUES ($1, $2, $3)', [
      state.user_id, state.state_json, state.updated_at
    ]);
  }
  await target.query('COMMIT');
  console.log(`Migração concluída: ${users.length} contas, ${sessions.length} sessões e ${states.length} registros de dados.`);
  console.log('As senhas não foram decifradas: os hashes foram copiados, então as contas mantêm a mesma senha.');
} catch (error) {
  await target.query('ROLLBACK').catch(() => {});
  console.error(`Migração não concluída: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all([source.end(), target.end()]);
}
