import { clearLoginFailures, createSession, loginAttemptsFor, makePasswordHash, parseBody, passwordMatches, ready, recordLoginFailure, sameOrigin, sendJson, pool } from '../_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'A solicitação foi recusada.' });
  try {
    await ready();
    const body = await parseBody(req, 16 * 1024);
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
    const { key, attempts } = loginAttemptsFor(req, email);
    if (attempts.count >= 8) return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
    const result = await pool.query('SELECT id, email, password_salt, password_hash FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    let valid = false;
    if (user && typeof password === 'string') {
      const candidate = await makePasswordHash(password, user.password_salt);
      valid = passwordMatches(candidate, user.password_hash);
    }
    if (!valid) {
      recordLoginFailure(key, attempts);
      return sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
    }
    clearLoginFailures(key);
    await createSession(res, user.id);
    return sendJson(res, 200, { user: { email: user.email } });
  } catch (error) {
    if (error.status) return sendJson(res, error.status, { error: error.message });
    console.error('Falha ao entrar:', error.message);
    return sendJson(res, 500, { error: 'Não foi possível entrar.' });
  }
}
