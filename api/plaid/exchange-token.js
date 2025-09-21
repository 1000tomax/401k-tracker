import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';
import plaidClient from '../_lib/plaidClient.js';
import { storeAccessToken } from '../_lib/plaidTokens.js';

const REQUIRED_ENV = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_TOKEN_ENCRYPTION_KEY'];

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

    const { public_token, account_type = 'unknown' } = req.body || {};

    if (!public_token) {
      send(res, 400, { ok: false, error: 'public_token is required in request body' });
      return;
    }

    const exchange = await plaidClient.exchangePublicToken(public_token);

    storeAccessToken(res, {
      accountType: account_type,
      accessToken: exchange.access_token,
      itemId: exchange.item_id
    });

    send(res, 200, {
      ok: true,
      account_type,
      item_id: exchange.item_id,
      request_id: exchange.request_id,
      environment: process.env.PLAID_ENV || 'sandbox',
      message: 'Access token stored securely on server'
    });
  } catch (error) {
    console.error('Failed to exchange public token:', error);

    const plaidError = error?.response?.data;
    const status = error?.response?.status || 500;
    send(res, status, {
      ok: false,
      error: plaidError?.display_message || error.message || 'Failed to exchange token',
      error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
      error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
      request_id: plaidError?.request_id
    });
  }
}
