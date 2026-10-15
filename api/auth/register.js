import { randomBytes } from 'node:crypto';
import { createSession, makePasswordHash, parseBody, passwordIsValid, ready, sameOrigin, sendJson, pool } from '../_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'A solicitação foi recusada.' });
  try {
    await ready();
    const body = await parseBody(req, 16 * 1024);
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
    if (!passwordIsValid(password)) return sendJson(res, 400, { error: 'A senha precisa ter pelo menos 10 caracteres.' });
    const salt = randomBytes(16).toString('hex');
    const passwordHash = await makePasswordHash(password, salt);
    const id = randomBytes(16).toString('hex');
    await pool.query('INSERT INTO users(id, email, password_salt, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
      id, email, salt, passwordHash, new Date().toISOString()
    ]);
    await createSession(res, id);
    return sendJson(res, 201, { user: { email } });
  } catch (error) {
    if (error.code === '23505') return sendJson(res, 409, { error: 'Já existe uma conta com este e-mail. Entre nela ou use outro e-mail.' });
    if (error.status) return sendJson(res, error.status, { error: error.message });
    console.error('Falha ao criar conta:', error.message);
    return sendJson(res, 500, { error: 'Não foi possível criar a conta.' });
  }
}
