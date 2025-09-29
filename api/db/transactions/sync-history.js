/**
 * Record sync history
 * POST /api/db/transactions/sync-history
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../../src/utils/cors.js';

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
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Require authentication
  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      connection_id,
      sync_type = 'manual',
      status = 'success',
      transactions_fetched = 0,
      transactions_new = 0,
      transactions_duplicate = 0,
      transactions_updated = 0,
      start_date = null,
      end_date = null,
      duration_ms = 0,
      error_message = null,
      error_details = null,
    } = body;

    if (!connection_id) {
      return send(res, 400, { ok: false, error: 'Missing connection_id' });
    }

    const supabase = createSupabaseAdmin();

    // Insert sync history record
    const { data: history, error: historyError } = await supabase
      .from('sync_history')
      .insert({
        connection_id,
        sync_type,
        status,
        transactions_fetched,
        transactions_new,
        transactions_duplicate,
        transactions_updated,
        start_date,
        end_date,
        duration_ms,
        error_message,
        error_details,
      })
      .select()
      .single();

    if (historyError) throw historyError;

    return send(res, 200, {
      ok: true,
      history,
    });
  } catch (error) {
    console.error('Error recording sync history:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to record sync history',
      details: error.message,
    });
  }
}