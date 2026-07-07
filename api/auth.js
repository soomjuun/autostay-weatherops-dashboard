const crypto = require('crypto');

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const AUTH_RATE_LIMIT_WINDOW_MS = numberFromEnv('AUTH_RATE_LIMIT_WINDOW_MS', 10 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = numberFromEnv('AUTH_RATE_LIMIT_MAX_ATTEMPTS', 8);
const authAttempts = globalThis.__weatherOpsAuthAttempts || new Map();
globalThis.__weatherOpsAuthAttempts = authAttempts;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const validToken = process.env.DASHBOARD_TOKEN;
  if (!validToken) {
    return res.status(500).send(errorPage('서버 설정 오류: DASHBOARD_TOKEN 환경변수가 설정되지 않았습니다.'));
  }
  const sessionSecret = process.env.SESSION_SECRET || validToken;

  if (req.method === 'POST') {
    const currentLimit = authRateStatus(req);
    if (currentLimit.blocked) {
      res.setHeader('Retry-After', String(currentLimit.retryAfterSeconds));
      return res.status(429).send(loginPage(false, {
        rateLimited: true,
        retryAfterSeconds: currentLimit.retryAfterSeconds
      }));
    }

    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const token = params.get('token') || '';
    if (secureCompare(token, validToken)) {
      clearAuthFailures(req);
      setCookieAndRedirect(req, res, createSessionValue(sessionSecret));
    } else {
      const nextLimit = recordAuthFailure(req);
      if (nextLimit.blocked) {
        res.setHeader('Retry-After', String(nextLimit.retryAfterSeconds));
        return res.status(429).send(loginPage(false, {
          rateLimited: true,
          retryAfterSeconds: nextLimit.retryAfterSeconds
        }));
      }
      return res.status(401).send(loginPage(true));
    }
    return;
  }

  if (req.method === 'GET') {
    const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
    const cookie = parseCookie(req.headers.cookie || '');
    if (verifySessionValue(cookie[cookieKey], sessionSecret)) {
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    return res.status(200).send(loginPage(false));
  }

  return res.status(405).send('Method Not Allowed');
};

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function authRateStatus(req) {
  const now = Date.now();
  const key = authRateKey(req);
  const bucket = authAttempts.get(key);
  if (!bucket || bucket.resetAt <= now) return { blocked: false, retryAfterSeconds: 0 };
  if (bucket.count < AUTH_RATE_LIMIT_MAX_ATTEMPTS) return { blocked: false, retryAfterSeconds: 0 };
  return { blocked: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

function recordAuthFailure(req) {
  const now = Date.now();
  const key = authRateKey(req);
  const bucket = authAttempts.get(key);
  const nextBucket = !bucket || bucket.resetAt <= now
    ? { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS }
    : { count: bucket.count + 1, resetAt: bucket.resetAt };
  authAttempts.set(key, nextBucket);
  return authRateStatus(req);
}

function clearAuthFailures(req) {
  authAttempts.delete(authRateKey(req));
}

function authRateKey(req) {
  const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'];
  const ip = String(forwardedFor || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return ip || 'unknown';
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function setCookieAndRedirect(req, res, sessionValue) {
  const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || '';
  const isLocal = /^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);
  const secure = !isLocal || proto === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieKey}=${encodeURIComponent(sessionValue)}; Path=/; HttpOnly${secure}; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax`);
  res.writeHead(302, { Location: '/' });
  res.end();
}

function createSessionValue(secret) {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${signSession(secret, issuedAt)}`;
}

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

function loginPage(failed, options = {}) {
  const rateLimited = Boolean(options.rateLimited);
  const waitMinutes = Math.max(1, Math.ceil(Number(options.retryAfterSeconds || 0) / 60));
  const errorMessage = rateLimited
    ? `시도 횟수가 많습니다. 약 ${waitMinutes}분 후 다시 시도하세요.`
    : '토큰이 올바르지 않습니다.';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[OPS] Weather Ops Dashboard 인증</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #e5e7eb; }
    .card { width: min(420px, calc(100vw - 32px)); background: #172033; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 36px; box-shadow: 0 24px 80px rgba(0,0,0,.4); }
    .title { font-size: 20px; font-weight: 800; letter-spacing: 0; margin-bottom: 6px; color: #fff; }
    .sub { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 26px; }
    label { display: block; font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; }
    input { width: 100%; height: 44px; border-radius: 8px; border: 1.5px solid ${failed || rateLimited ? '#f87171' : 'rgba(255,255,255,.18)'}; background: #0f172a; color: #f8fafc; padding: 0 13px; outline: none; font-size: 15px; }
    input:focus { border-color: #38bdf8; }
    .error { display: ${failed || rateLimited ? 'block' : 'none'}; margin-top: 8px; color: #fca5a5; font-size: 12px; }
    button { width: 100%; height: 44px; border: 0; border-radius: 8px; margin-top: 18px; background: #0ea5e9; color: #fff; font-weight: 800; cursor: pointer; }
    .hint { margin-top: 18px; color: #64748b; font-size: 12px; line-height: 1.6; text-align: center; }
  </style>
</head>
<body>
  <main class="card">
    <div class="title">[OPS] Weather Ops Dashboard</div>
    <p class="sub">기상 리스크, 현장 조치, AS 정상화, 회복 수요를 확인하는 내부 운영 화면입니다.</p>
    <form method="POST" action="/api/auth">
      <label for="token">액세스 토큰</label>
      <input id="token" name="token" type="password" placeholder="팀에서 공유된 토큰 입력" autofocus autocomplete="current-password">
      <div class="error">${escapeHtml(errorMessage)}</div>
      <button type="submit">입장하기</button>
    </form>
    <p class="hint">내부 운영 전용 화면입니다. 토큰은 Vercel 환경변수로만 관리하세요.</p>
  </main>
</body>
</html>`;
}

function errorPage(message) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>설정 오류</title></head><body style="font-family:sans-serif;background:#111827;color:#fca5a5;display:grid;place-items:center;min-height:100vh"><p>${escapeHtml(message)}</p></body></html>`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
