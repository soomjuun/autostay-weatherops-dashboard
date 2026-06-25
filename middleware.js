export const config = {
  matcher: [
    '/((?!api/auth|api/check|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)'
  ]
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export default async function middleware(request) {
  const validToken = process.env.DASHBOARD_TOKEN;
  const sessionSecret = process.env.SESSION_SECRET || validToken;
  const cookieKey = process.env.COOKIE_KEY || 'weather_ops_auth';

  if (!validToken) {
    return new Response('DASHBOARD_TOKEN is not configured.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const cookies = request.headers.get('cookie') || '';
  const escapedCookieKey = cookieKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${escapedCookieKey}=([^;]+)`));
  const sessionValue = match ? decodeURIComponent(match[1]) : null;
  if (await verifySessionValue(sessionValue, sessionSecret)) return;

  const url = new URL(request.url);
  const path = url.pathname;
  const isAsset = /\.(css|js|mjs|png|jpg|jpeg|svg|ico|woff2?|ttf|webp|gif|map)$/i.test(path);

  if (isAsset) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', redirect: '/api/auth' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  return Response.redirect(new URL('/api/auth', request.url), 302);
}

async function verifySessionValue(value, secret) {
  const parts = String(value || '').split('.');
  if (parts.length !== 2) return false;
  const issuedAt = Number(parts[0]);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return false;
  const expected = await signSession(secret, parts[0]);
  return constantEqual(parts[1], expected);
}

async function signSession(secret, issuedAt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(issuedAt));
  return base64Url(signature);
}

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
