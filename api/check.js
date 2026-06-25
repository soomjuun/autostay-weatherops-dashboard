const crypto = require('crypto');

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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
  const sessionSecret = process.env.SESSION_SECRET || validToken;

  const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
  const cookie = parseCookie(req.headers.cookie || '');
  if (verifySessionValue(cookie[cookieKey], sessionSecret)) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false, redirect: '/api/auth' });
};

function verifySessionValue(value, secret) {
  const parts = String(value || '').split('.');
  if (parts.length !== 2) return false;
  const issuedAt = Number(parts[0]);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return false;
  return secureCompare(parts[1], signSession(secret, parts[0]));
}

function signSession(secret, issuedAt) {
  return crypto.createHmac('sha256', secret).update(issuedAt).digest('base64url');
}

function secureCompare(a, b) {
  const left = crypto.createHash('sha256').update(String(a || '')).digest();
  const right = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(left, right);
}
