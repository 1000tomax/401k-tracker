import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';
import plaidClient from '../_lib/plaidClient.js';
import { getAccessToken } from '../_lib/plaidTokens.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    send(res, 405, { ok: false, error: 'Use GET for this endpoint.' });
    return;
  }

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    send(res, auth.status, { ok: false, error: auth.message });
    return;
  }

  const url = new URL(req.url, 'http://local');
  const accountType = (url.searchParams.get('accountType') || url.searchParams.get('account_type') || '').toLowerCase();

  if (!accountType) {
    send(res, 400, { ok: false, error: 'accountType query parameter is required' });
    return;
  }

  const stored = getAccessToken(req, accountType);
  if (!stored?.accessToken) {
    send(res, 404, { ok: false, error: 'No stored access token for account', accountType });
    return;
  }

  try {
    const status = await plaidClient.getItemStatus(stored.accessToken);
    send(res, 200, { ok: true, status });
  } catch (error) {
    console.error('Failed to fetch item status:', error);
    const plaidError = error?.response?.data;
    const statusCode = error?.response?.status || 500;
    send(res, statusCode, {
      ok: false,
      error: plaidError?.display_message || error.message || 'Failed to fetch item status',
      error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
      error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
      request_id: plaidError?.request_id
    });
  }
}
