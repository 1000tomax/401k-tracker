/**
 * Get Plaid billing information for all items
 */
import { initializePlaidClient } from '../../lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const { plaidClient } = initializePlaidClient();
    const supabase = createSupabaseAdmin();

    // Get all Plaid connections from the database
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      return send(res, 200, {
        ok: true,
        items: [],
        message: 'No Plaid connections found',
      });
    }

    // Get billing info for each item
    const itemDetails = [];
    const errors = [];

    for (const connection of connections) {
      try {
        const response = await plaidClient.itemGet({
          access_token: connection.access_token,
        });

        const item = response.data.item;

        itemDetails.push({
          item_id: item.item_id,
          institution_name: connection.institution_name,
          institution_id: connection.institution_id,
          billed_products: item.billed_products || [],
          available_products: item.available_products || [],
          consented_products: item.consented_products || [],
          connected_at: connection.connected_at,
          last_synced_at: connection.last_synced_at,
          accounts: connection.accounts || [],
        });
      } catch (error) {
        errors.push({
          item_id: connection.item_id,
          institution_name: connection.institution_name,
          error: error.message,
        });
      }
    }

    return send(res, 200, {
      ok: true,
      items: itemDetails,
      total_items: itemDetails.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Error fetching Plaid billing items:', error);
    return send(res, 500, {
      ok: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}