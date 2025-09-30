const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

function resolveAllowedOrigin(env) {
  const configured = (env.CORS_ORIGIN || '').trim();
  if (configured) {
    return configured;
  }
  const nodeEnv = (env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production' ? 'null' : DEFAULT_DEV_ORIGIN;
}

export function createCorsHeaders(env) {
  const origin = resolveAllowedOrigin(env);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': 'Content-Type, X-401K-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

export function handleCors(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: createCorsHeaders(env),
    });
  }
  return null;
}

export function requireSharedToken(request, env) {
  const expectedRaw = env.API_SHARED_TOKEN;
  if (!expectedRaw) {
    return { ok: false, status: 500, message: 'Server misconfigured: shared token missing.' };
  }

  const expected = String(expectedRaw).trim();
  const provided = request.headers.get('x-401k-token');

  if (!provided || typeof provided !== 'string') {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  if (provided.trim() !== expected) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  return { ok: true };
}

export function jsonResponse(data, status = 200, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders(env),
    },
  });
}