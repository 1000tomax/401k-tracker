/**
 * @fileoverview This file provides CORS (Cross-Origin Resource Sharing) and authentication
 * utilities specifically designed for the Cloudflare Workers environment. It handles
 * OPTIONS requests, token validation, and creates CORS-compliant JSON responses.
 */

const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

/**
 * Resolves the allowed origin for CORS requests based on the Cloudflare environment.
 * @param {object} env The Cloudflare environment object containing secrets and variables.
 * @returns {string} The allowed origin URL or 'null'.
 */
function resolveAllowedOrigin(env) {
  const configured = (env.CORS_ORIGIN || '').trim();
  if (configured) {
    return configured;
  }
  const nodeEnv = (env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production' ? 'null' : DEFAULT_DEV_ORIGIN;
}

/**
 * Creates an object containing the necessary CORS headers.
 * @param {object} env The Cloudflare environment object.
 * @returns {object} An object with CORS headers.
 */
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

/**
 * Handles preflight OPTIONS requests for CORS. If the request method is OPTIONS,
 * it returns a response with the appropriate CORS headers.
 * @param {Request} request The incoming request object.
 * @param {object} env The Cloudflare environment object.
 * @returns {Response|null} A `Response` object for OPTIONS requests, or null otherwise.
 */
export function handleCors(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: createCorsHeaders(env),
    });
  }
  return null;
}

/**
 * Validates the shared authentication token from the request headers against the
 * one stored in the Cloudflare environment.
 * @param {Request} request The incoming request object.
 * @param {object} env The Cloudflare environment object.
 * @returns {{ok: boolean, status?: number, message?: string}} An object indicating the result of the validation.
 */
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

/**
 * Creates a JSON response with the given data, status, and appropriate CORS headers.
 * @param {object} data The data to be sent in the response body.
 * @param {number} [status=200] The HTTP status code for the response.
 * @param {object} env The Cloudflare environment object.
 * @returns {Response} A `Response` object.
 */
export function jsonResponse(data, status = 200, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders(env),
    },
  });
}