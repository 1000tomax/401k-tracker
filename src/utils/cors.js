const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

function resolveAllowedOrigin() {
  const configured = (process.env.CORS_ORIGIN || '').trim();
  if (configured) {
    return configured;
  }
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production' ? 'null' : DEFAULT_DEV_ORIGIN;
}

export function allowCorsAndAuth(req, res) {
  const origin = resolveAllowedOrigin();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-401K-Token');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return { ended: true };
  }

  return { ended: false };
}

export function requireSharedToken(req) {
  const expectedRaw = process.env.API_SHARED_TOKEN;
  if (!expectedRaw) {
    return { ok: false, status: 500, message: 'Server misconfigured: shared token missing.' };
  }

  const expected = String(expectedRaw).trim();
  const headers = req?.headers || {};
  let provided;

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'x-401k-token') {
      const value = headers[key];
      provided = Array.isArray(value) ? value[0] : value;
      break;
    }
  }

  if (!provided || typeof provided !== 'string') {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  if (provided.trim() !== expected) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  return { ok: true };
}
