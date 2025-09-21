import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default function handler(req, res) {
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

  const hasClientId = Boolean(process.env.PLAID_CLIENT_ID);
  const hasSecret = Boolean(process.env.PLAID_SECRET);
  const hasEncryptionKey = Boolean(process.env.PLAID_TOKEN_ENCRYPTION_KEY);

  send(res, 200, {
    ok: hasClientId && hasSecret && hasEncryptionKey,
    plaidEnv: process.env.PLAID_ENV || 'sandbox',
    hasClientId,
    hasSecret,
    hasEncryptionKey
  });
}
