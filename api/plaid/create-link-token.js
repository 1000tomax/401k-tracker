import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';
import plaidClient from '../_lib/plaidClient.js';

const REQUIRED_ENV = ['PLAID_CLIENT_ID', 'PLAID_SECRET'];

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function validateEnv() {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { ok: false, error: 'Use POST for this endpoint.' });
    return;
  }

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    send(res, auth.status, { ok: false, error: auth.message });
    return;
  }

  try {
    validateEnv();

    const { userId = 'default_user', accountType = 'unknown' } = req.body || {};
    const data = await plaidClient.createLinkToken({ userId, accountType });

    send(res, 200, {
      ok: true,
      link_token: data.link_token,
      expiration: data.expiration,
      request_id: data.request_id,
      accountType,
      environment: process.env.PLAID_ENV || 'sandbox'
    });
  } catch (error) {
    console.error('Failed to create link token:', error);

    const plaidError = error?.response?.data;
    const status = error?.response?.status || 500;
    send(res, status, {
      ok: false,
      error: plaidError?.display_message || error.message || 'Failed to create link token',
      error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
      error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
      request_id: plaidError?.request_id
    });
  }
}
