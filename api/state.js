import { currentUser, EMPTY_STATE, parseBody, pool, ready, sameOrigin, sendJson } from './_shared.js';

export default async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return sendJson(res, 405, { error: 'Método não permitido.' }, { Allow: 'GET, PUT' });
  try {
    await ready();
    const user = await currentUser(req);
    if (!user) return sendJson(res, 401, { error: 'Sua sessão terminou. Entre novamente.' });
    if (req.method === 'GET') {
      const result = await pool.query('SELECT state_json FROM user_state WHERE user_id = $1', [user.id]);
      let state = EMPTY_STATE;
      if (result.rows[0]) {
        try { state = JSON.parse(result.rows[0].state_json); }
        catch { return sendJson(res, 500, { error: 'Os dados salvos não puderam ser lidos.' }); }
      }
      return sendJson(res, 200, { state });
    }
    if (!sameOrigin(req)) return sendJson(res, 403, { error: 'A solicitação foi recusada.' });
    const body = await parseBody(req);
    const state = body.state;
    if (!state || !Array.isArray(state.accounts) || !Array.isArray(state.movs) || !Array.isArray(state.sheets) || !state.settings) {
      return sendJson(res, 400, { error: 'Os dados enviados estão incompletos.' });
    }
    await pool.query(`INSERT INTO user_state(user_id, state_json, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at`, [
      user.id, JSON.stringify(state), new Date().toISOString()
    ]);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error.status) return sendJson(res, error.status, { error: error.message });
    console.error('Falha ao ler ou salvar dados:', error.message);
    return sendJson(res, 500, { error: 'Não foi possível acessar os dados.' });
  }
}
