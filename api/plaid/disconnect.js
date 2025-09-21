import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';
import plaidClient from '../_lib/plaidClient.js';
import { getAccessToken, clearAccessToken } from '../_lib/plaidTokens.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
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

  const { account_type: rawAccountType } = req.body || {};
  const accountType = (rawAccountType || '').toLowerCase();

  if (!accountType) {
    send(res, 400, { ok: false, error: 'account_type is required' });
    return;
  }

  const stored = getAccessToken(req, accountType);
  if (!stored?.accessToken) {
    clearAccessToken(res, accountType);
    send(res, 200, { ok: true, message: 'No stored access token found; nothing to disconnect.' });
    return;
  }

  try {
    await plaidClient.removeItem(stored.accessToken);
  } catch (error) {
    console.error('Failed to remove Plaid item:', error);
    const plaidError = error?.response?.data;
    // Continue to clear local cookie even if Plaid call fails.
    clearAccessToken(res, accountType);
    send(res, 502, {
      ok: false,
      error: plaidError?.display_message || error.message || 'Failed to revoke account',
      error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
      error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
      request_id: plaidError?.request_id
    });
    return;
  }

  clearAccessToken(res, accountType);
  send(res, 200, { ok: true, message: 'Account disconnected', accountType });
}
