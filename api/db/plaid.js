/**
 * Consolidated Plaid connection endpoint
 * Handles GET (connections) and POST (save connection)
 */
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

  try {
    // GET - Get connections
    if (req.method === 'GET') {
      const supabase = createSupabaseAdmin();

      const { data: connections, error } = await supabase
        .from('plaid_connections')
        .select('*')
        .order('connected_at', { ascending: false });

      if (error) throw error;

      return send(res, 200, {
        ok: true,
        connections: connections || [],
      });
    }

    // POST - Save connection
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        access_token,
        item_id,
        institution_id,
        institution_name,
        accounts,
      } = body;

      if (!access_token || !item_id) {
        return send(res, 400, {
          ok: false,
          error: 'Missing required fields: access_token, item_id',
        });
      }

      const supabase = createSupabaseAdmin();

      // Check if connection already exists
      const { data: existing } = await supabase
        .from('plaid_connections')
        .select('id')
        .eq('item_id', item_id)
        .single();

      if (existing) {
        // Update existing connection
        const { data: updated, error: updateError } = await supabase
          .from('plaid_connections')
          .update({
            access_token,
            institution_id,
            institution_name,
            accounts,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return send(res, 200, {
          ok: true,
          connection: updated,
          action: 'updated',
        });
      } else {
        // Insert new connection
        const { data: inserted, error: insertError } = await supabase
          .from('plaid_connections')
          .insert({
            access_token,
            item_id,
            institution_id,
            institution_name,
            accounts,
            connected_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return send(res, 201, {
          ok: true,
          connection: inserted,
          action: 'created',
        });
      }
    }

    // Method not allowed
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Error in plaid endpoint:', error);
    return send(res, 500, {
      ok: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}