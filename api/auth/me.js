import { clearSessionCookie, currentUser, getCookie, ready, sendJson } from '../_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' }, { Allow: 'GET' });
  try {
    await ready();
    const user = await currentUser(req);
    if (!user && getCookie(req, 'cc_session')) clearSessionCookie(res);
    return sendJson(res, 200, { authenticated: !!user, user: user ? { email: user.email } : null });
  } catch (error) {
    console.error('Falha ao verificar sessão:', error.message);
    return sendJson(res, 500, { error: 'Não foi possível verificar sua sessão.' });
  }
}
