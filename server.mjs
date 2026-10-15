import { createServer } from 'node:http';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import mariadb from 'mariadb';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Hospedagens precisam receber conexões externas; o .env local pode sobrescrever para 127.0.0.1.
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const DB_URL = process.env.DB_URL || process.env.MARIADB_PRIVATE_URL || '';
let parsedDbUrl = null;
if (DB_URL) {
  try {
    parsedDbUrl = new URL(DB_URL);
    if (!['mariadb:', 'mysql:'].includes(parsedDbUrl.protocol)) throw new Error('Protocolo inválido.');
  } catch {
    console.error('DB_URL/MARIADB_PRIVATE_URL inválida. Use a URL privada fornecida pelo serviço MariaDB.');
    process.exit(1);
  }
}
const DB_HOST = parsedDbUrl?.hostname || process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(parsedDbUrl?.port || process.env.DB_PORT || 3306);
const DB_NAME = decodeURIComponent(parsedDbUrl?.pathname.slice(1) || process.env.DB_NAME || 'familia_prospera');
const DB_USER = decodeURIComponent(parsedDbUrl?.username || process.env.DB_USER || 'familia_app');
const DB_PASSWORD = decodeURIComponent(parsedDbUrl?.password || process.env.DB_PASSWORD || '');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const MAX_BODY = 5 * 1024 * 1024;
const loginFailures = new Map();

if (!DB_PASSWORD) {
  console.error('Informe DB_PASSWORD ou DB_URL/MARIADB_PRIVATE_URL nas variáveis de ambiente.');
  process.exit(1);
}

const pool = mariadb.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  acquireTimeout: 10000,
  connectTimeout: 10000,
  charset: 'utf8mb4'
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_salt CHAR(32) CHARACTER SET ascii NOT NULL,
      password_hash BINARY(64) NOT NULL,
      created_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      expires_at BIGINT NOT NULL,
      CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_state (
      user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      state_json LONGTEXT NOT NULL,
      updated_at VARCHAR(30) NOT NULL,
      CONSTRAINT user_state_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

async function startDatabase() {
  try {
    await pool.query('SELECT 1');
    await initializeDatabase();
  } catch (error) {
    await pool.end().catch(() => {});
    const reason = error?.cause?.code || error?.code;

    console.error(`Não foi possível conectar ao MariaDB em ${DB_HOST}:${DB_PORT}, banco "${DB_NAME}", usuário "${DB_USER}".`);
    if (reason === 'ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED') {
      console.error('O MariaDB está exigindo auth_gssapi_client. O usuário do banco precisa ser recriado com mysql_native_password. Execute o arquivo schema.sql no HeidiSQL usando uma conta administradora.');
    } else if (reason === 'ER_ACCESS_DENIED_ERROR' || reason === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR') {
      console.error('A conexão foi recusada. Confira DB_USER, DB_PASSWORD e DB_HOST no .env; a senha deve ser a mesma definida no schema.sql.');
    } else if (reason === 'ER_BAD_DB_ERROR') {
      console.error('O banco ainda não existe. Execute o arquivo schema.sql no HeidiSQL usando uma conta administradora.');
    } else {
      console.error(`Detalhe do MariaDB: ${error?.cause?.message || error.message}`);
    }
    process.exit(1);
  }
}

await startDatabase();

const EMPTY_STATE = {
  accounts: [],
  movs: [],
  sheets: [],
  settings: { hide: false, currency: 'BRL', accent: 'azul', theme: '', scale: 1, guideSeen: false },
  v: 2
};

function json(res, status, value, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(value));
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function setSessionCookie(req, res, token) {
  const expires = new Date(Date.now() + SESSION_MS).toUTCString();
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && (req.socket.encrypted || process.env.NODE_ENV === 'production')) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `cc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`);
}

function clearSessionCookie(req, res) {
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && (req.socket.encrypted || process.env.NODE_ENV === 'production')) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `cc_session=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0${secure}`);
}

async function currentUser(req) {
  const token = cookies(req).cc_session;
  if (!token || token.length > 200) return null;
  const rows = await pool.query(`
    SELECT u.id, u.email, s.token_hash
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `, [hashToken(token), Date.now()]);
  return rows[0] || null;
}

async function createSession(req, res, userId) {
  const token = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
    hashToken(token), userId, Date.now() + SESSION_MS
  ]);
  setSessionCookie(req, res, token);
}

async function readJson(req, maxBytes = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('O envio é grande demais.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Não consegui ler os dados enviados.'), { status: 400 }); }
}

function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}

function passwordIsValid(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

async function makePasswordHash(password, salt) {
  return scrypt(password, salt, PASSWORD_BYTES, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function rateLimitKey(req, email) {
  return `${req.socket.remoteAddress || 'local'}:${email}`;
}

function requestStatic(res, pathname) {
  const allowed = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/app.css': ['app.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8']
  };
  const found = allowed[pathname];
  if (!found) { res.writeHead(404); res.end('Não encontrado.'); return; }
  readFile(path.join(ROOT, found[0])).then(file => {
    res.writeHead(200, {
      'Content-Type': found[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    });
    res.end(file);
  }).catch(() => { res.writeHead(500); res.end('Não consegui abrir o arquivo.'); });
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  try {
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = await currentUser(req);
      if (!user && cookies(req).cc_session) clearSessionCookie(req, res);
      return json(res, 200, { authenticated: !!user, user: user ? { email: user.email } : null });
    }

    if (req.method === 'POST' && (pathname === '/api/auth/register' || pathname === '/api/auth/login')) {
      if (!sameOrigin(req)) return json(res, 403, { error: 'A solicitação foi recusada.' });
      const body = await readJson(req, 16 * 1024);
      const email = String(body.email || '').trim().toLowerCase();
      const password = body.password;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(res, 400, { error: 'Informe um e-mail válido.' });
      }

      if (pathname.endsWith('/register')) {
        if (!passwordIsValid(password)) return json(res, 400, { error: 'A senha precisa ter pelo menos 10 caracteres.' });
        const salt = randomBytes(16).toString('hex');
        const passwordHash = await makePasswordHash(password, salt);
        const id = randomBytes(16).toString('hex');
        try {
          await pool.query('INSERT INTO users(id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [
            id, email, salt, passwordHash, new Date().toISOString()
          ]);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) return json(res, 409, { error: 'Já existe uma conta com este e-mail. Entre nela ou use outro e-mail.' });
          throw error;
        }
        await createSession(req, res, id);
        return json(res, 201, { user: { email } });
      }

      const key = rateLimitKey(req, email);
      const attempts = loginFailures.get(key) || { count: 0, resetAt: 0 };
      if (attempts.resetAt < Date.now()) { attempts.count = 0; attempts.resetAt = Date.now() + 15 * 60 * 1000; }
      if (attempts.count >= 8) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
      const rows = await pool.query('SELECT id, email, password_salt, password_hash FROM users WHERE email = ?', [email]);
      const user = rows[0];
      let valid = false;
      if (user && typeof password === 'string') {
        const candidate = await makePasswordHash(password, user.password_salt);
        const stored = Buffer.from(user.password_hash);
        valid = candidate.length === stored.length && timingSafeEqual(candidate, stored);
      }
      if (!valid) {
        attempts.count += 1;
        loginFailures.set(key, attempts);
        return json(res, 401, { error: 'E-mail ou senha incorretos.' });
      }
      loginFailures.delete(key);
      await createSession(req, res, user.id);
      return json(res, 200, { user: { email: user.email } });
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'A solicitação foi recusada.' });
      const token = cookies(req).cc_session;
      if (token) await pool.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
      clearSessionCookie(req, res);
      return json(res, 200, { ok: true });
    }

    if ((req.method === 'GET' || req.method === 'PUT') && pathname === '/api/state') {
      const user = await currentUser(req);
      if (!user) return json(res, 401, { error: 'Sua sessão terminou. Entre novamente.' });
      if (req.method === 'GET') {
        const rows = await pool.query('SELECT state_json FROM user_state WHERE user_id = ?', [user.id]);
        const row = rows[0];
        let state = EMPTY_STATE;
        if (row) {
          try { state = JSON.parse(row.state_json); }
          catch { return json(res, 500, { error: 'Os dados salvos não puderam ser lidos.' }); }
        }
        return json(res, 200, { state });
      }
      if (!sameOrigin(req)) return json(res, 403, { error: 'A solicitação foi recusada.' });
      const body = await readJson(req);
      const state = body.state;
      if (!state || !Array.isArray(state.accounts) || !Array.isArray(state.movs) || !Array.isArray(state.sheets) || !state.settings) {
        return json(res, 400, { error: 'Os dados enviados estão incompletos.' });
      }
      const stateJson = JSON.stringify(state);
      await pool.query(`INSERT INTO user_state(user_id, state_json, updated_at) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = VALUES(updated_at)`, [
        user.id, stateJson, new Date().toISOString()
      ]);
      return json(res, 200, { ok: true });
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Rota não encontrada.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return requestStatic(res, pathname);
  } catch (error) {
    if (res.headersSent) return res.end();
    console.error('Falha ao processar solicitação:', error.message);
    return json(res, error.status || 500, { error: error.status ? error.message : 'Ocorreu um erro interno.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Família Próspera aberto em http://${HOST}:${PORT}`);
  console.log(`Banco conectado: MariaDB em ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
});

async function close() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
