module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const validToken = process.env.DASHBOARD_TOKEN;
  if (!validToken) {
    return res.status(500).send(errorPage('서버 설정 오류: DASHBOARD_TOKEN 환경변수가 설정되지 않았습니다.'));
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const token = params.get('token') || '';
    if (token === validToken) {
      setCookieAndRedirect(req, res, validToken);
    } else {
      return res.status(401).send(loginPage(true));
    }
    return;
  }

  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (token && token === validToken) {
      setCookieAndRedirect(req, res, validToken);
      return;
    }
    const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
    const cookie = parseCookie(req.headers.cookie || '');
    if (cookie[cookieKey] === validToken) {
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

function setCookieAndRedirect(req, res, token) {
  const maxAge = 60 * 60 * 24 * 7;
  const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || '';
  const isLocal = /^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);
  const secure = !isLocal || proto === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieKey}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; Max-Age=${maxAge}; SameSite=Lax`);
  res.writeHead(302, { Location: '/' });
  res.end();
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

function loginPage(failed) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weather Ops Dashboard 인증</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #e5e7eb; }
    .card { width: min(420px, calc(100vw - 32px)); background: #172033; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 36px; box-shadow: 0 24px 80px rgba(0,0,0,.4); }
    .title { font-size: 20px; font-weight: 800; letter-spacing: 0; margin-bottom: 6px; color: #fff; }
    .sub { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 26px; }
    label { display: block; font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; }
    input { width: 100%; height: 44px; border-radius: 8px; border: 1.5px solid ${failed ? '#f87171' : 'rgba(255,255,255,.18)'}; background: #0f172a; color: #f8fafc; padding: 0 13px; outline: none; font-size: 15px; }
    input:focus { border-color: #38bdf8; }
    .error { display: ${failed ? 'block' : 'none'}; margin-top: 8px; color: #fca5a5; font-size: 12px; }
    button { width: 100%; height: 44px; border: 0; border-radius: 8px; margin-top: 18px; background: #0ea5e9; color: #fff; font-weight: 800; cursor: pointer; }
    .hint { margin-top: 18px; color: #64748b; font-size: 12px; line-height: 1.6; text-align: center; }
  </style>
</head>
<body>
  <main class="card">
    <div class="title">Weather Ops Dashboard</div>
    <p class="sub">기상 리스크, 현장 조치, AS 정상화, 회복 수요를 확인하는 내부 운영 화면입니다.</p>
    <form method="POST" action="/api/auth">
      <label for="token">액세스 토큰</label>
      <input id="token" name="token" type="password" placeholder="팀에서 공유된 토큰 입력" autofocus autocomplete="current-password">
      <div class="error">토큰이 올바르지 않습니다.</div>
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
