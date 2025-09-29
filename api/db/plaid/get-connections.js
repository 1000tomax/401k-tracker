/**
 * Get all Plaid connections from database
 * GET /api/db/plaid/get-connections
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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Require authentication
  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    const supabase = createSupabaseAdmin();

    // Get all active connections
    const { data: connections, error } = await supabase
      .from('plaid_connections')
      .select('*')
      .eq('status', 'active')
      .order('connected_at', { ascending: false });

    if (error) throw error;

    // Get accounts for each connection
    const connectionsWithAccounts = await Promise.all(
      connections.map(async (connection) => {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('*')
          .eq('connection_id', connection.id);

        return {
          id: connection.id,
          item_id: connection.item_id,
          access_token: connection.access_token,
          institution_id: connection.institution_id,
          institution_name: connection.institution_name,
          connected_at: connection.connected_at,
          last_synced_at: connection.last_synced_at,
          status: connection.status,
          accounts: accounts || [],
        };
      })
    );

    return send(res, 200, {
      ok: true,
      connections: connectionsWithAccounts,
    });
  } catch (error) {
    console.error('Error fetching Plaid connections:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to fetch connections',
      details: error.message,
    });
  }
}