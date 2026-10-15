import { clearSessionCookie, getCookie, hashToken, pool, ready, sameOrigin, sendJson } from '../_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'A solicitação foi recusada.' });
  try {
    await ready();
    const token = getCookie(req, 'cc_session');
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('Falha ao sair:', error.message);
    return sendJson(res, 500, { error: 'Não foi possível encerrar a sessão.' });
  }
}
