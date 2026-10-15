import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ensureSchema, pool } from './_db.js';

const scrypt = promisify(scryptCallback);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const loginFailures = new Map();

export const EMPTY_STATE = {
  accounts: [], movs: [], sheets: [],
  settings: { hide: false, currency: 'BRL', accent: 'azul', theme: '', scale: 1, guideSeen: false },
  v: 2
};

export function sendJson(res, status, value, headers = {}) {
  res.status(status);
  for (const [name, content] of Object.entries(headers)) res.setHeader(name, content);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res.json(value);
}

export function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}

export function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ''; }
  }
  return '';
}

function secureCookie() {
  return process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
}

export function setSessionCookie(res, token) {
  const expires = new Date(Date.now() + SESSION_MS).toUTCString();
  const secure = secureCookie() ? '; Secure' : '';
  res.setHeader('Set-Cookie', `cc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = secureCookie() ? '; Secure' : '';
  res.setHeader('Set-Cookie', `cc_session=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0${secure}`);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function currentUser(req) {
  const token = getCookie(req, 'cc_session');
  if (!token || token.length > 200) return null;
  const result = await pool.query(`
    SELECT u.id, u.email, s.token_hash
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > $2
  `, [hashToken(token), Date.now()]);
  return result.rows[0] || null;
}

export async function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token), userId, Date.now() + SESSION_MS
  ]);
  setSessionCookie(res, token);
}

export function passwordIsValid(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 200;
}

export async function makePasswordHash(password, salt) {
  return scrypt(password, salt, PASSWORD_BYTES, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export async function ready() {
  await ensureSchema();
}

export async function parseBody(req, maxBytes = 5 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : '';
  if (Buffer.byteLength(raw) > maxBytes) throw Object.assign(new Error('O envio é grande demais.'), { status: 413 });
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Não consegui ler os dados enviados.'), { status: 400 }); }
}

export function loginAttemptsFor(req, email) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = `${forwarded || 'local'}:${email}`;
  const attempts = loginFailures.get(key) || { count: 0, resetAt: 0 };
  if (attempts.resetAt < Date.now()) { attempts.count = 0; attempts.resetAt = Date.now() + 15 * 60 * 1000; }
  return { key, attempts };
}

export function passwordMatches(candidate, storedHash) {
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function recordLoginFailure(key, attempts) {
  attempts.count += 1;
  loginFailures.set(key, attempts);
}

export function clearLoginFailures(key) {
  loginFailures.delete(key);
}

export { pool };
