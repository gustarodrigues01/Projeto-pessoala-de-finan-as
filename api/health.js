export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').json({ error: 'Método não permitido.' });
  return res.status(200).setHeader('Cache-Control', 'no-store').json({ ok: true });
}
