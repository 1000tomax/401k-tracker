import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';
import { getAllStoredTokens } from '../_lib/plaidTokens.js';

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

  const tokens = getAllStoredTokens(req);

  send(res, 200, {
    ok: true,
    accounts: tokens.map(token => ({
      accountType: token.accountType,
      itemId: token.itemId,
      connectedAt: token.connectedAt
    }))
  });
}
