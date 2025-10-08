/**
 * @fileoverview This file provides CORS (Cross-Origin Resource Sharing) and authentication
 * utilities for server environments, likely used for local development or Node.js-based functions.
 * It is not intended for Cloudflare Workers, which have a separate CORS utility.
 */

const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

/**
 * Resolves the allowed origin for CORS requests based on environment variables.
 * It prioritizes the `CORS_ORIGIN` variable and falls back to a default based on `NODE_ENV`.
 * @returns {string} The allowed origin URL or 'null'.
 */
function resolveAllowedOrigin() {
  const configured = (process.env.CORS_ORIGIN || '').trim();
  if (configured) {
    return configured;
  }
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production' ? 'null' : DEFAULT_DEV_ORIGIN;
}

/**
 * Sets the necessary CORS headers on an HTTP response and handles preflight OPTIONS requests.
 * @param {object} req The HTTP request object.
 * @param {object} res The HTTP response object.
 * @returns {{ended: boolean}} An object indicating if the response has been ended (for OPTIONS requests).
 */
export function allowCorsAndAuth(req, res) {
  const origin = resolveAllowedOrigin();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-401K-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return { ended: true };
  }

  return { ended: false };
}

/**
 * Validates the presence and correctness of a shared authentication token in the request headers.
 * The token is expected in the `X-401K-Token` header and is compared against the `API_SHARED_TOKEN`
 * environment variable.
 *
 * @param {object} req The HTTP request object.
 * @returns {{ok: boolean, status?: number, message?: string}} An object indicating the result of the validation.
 */
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
