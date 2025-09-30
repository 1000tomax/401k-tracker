/**
 * Get Plaid billing information for all items
 * Cloudflare Workers function
 */
import { initializePlaidClient } from '../../../lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const { plaidClient } = initializePlaidClient(env);
    const supabase = createSupabaseAdmin(env);

    // Get all Plaid connections from the database
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      return jsonResponse({
        ok: true,
        items: [],
        message: 'No Plaid connections found',
      }, 200, env);
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

    return jsonResponse({
      ok: true,
      items: itemDetails,
      total_items: itemDetails.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200, env);

  } catch (error) {
    console.error('Error fetching Plaid billing items:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}