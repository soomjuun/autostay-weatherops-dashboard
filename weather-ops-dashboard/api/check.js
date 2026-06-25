function parseCookie(str) {
  const out = {};
  (str || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = decodeURIComponent(part.slice(index + 1));
    if (key) out[key] = value;
  });
  return out;
}

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const validToken = process.env.DASHBOARD_TOKEN;
  if (!validToken) {
    return res.status(500).json({ ok: false, error: 'DASHBOARD_TOKEN is not configured.' });
  }

  const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
  const cookie = parseCookie(req.headers.cookie || '');
  if (cookie[cookieKey] === validToken) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false, redirect: '/api/auth' });
};
