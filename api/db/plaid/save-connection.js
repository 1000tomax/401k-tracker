/**
 * Save Plaid connection to database
 * POST /api/db/plaid/save-connection
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
    const { access_token, item_id, institution_id, institution_name, accounts } = body;

    if (!access_token || !item_id) {
      return send(res, 400, { ok: false, error: 'Missing required fields: access_token, item_id' });
    }

    const supabase = createSupabaseAdmin();

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('plaid_connections')
      .select('id')
      .eq('item_id', item_id)
      .single();

    let connection;

    if (existing) {
      // Update existing connection
      const { data, error } = await supabase
        .from('plaid_connections')
        .update({
          access_token,
          institution_id,
          institution_name,
          last_synced_at: new Date().toISOString(),
          status: 'active',
          error_message: null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      connection = data;
    } else {
      // Insert new connection
      const { data, error } = await supabase
        .from('plaid_connections')
        .insert({
          item_id,
          access_token,
          institution_id,
          institution_name,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      connection = data;
    }

    // Save accounts if provided
    if (accounts && Array.isArray(accounts)) {
      for (const account of accounts) {
        const { data: existingAccount } = await supabase
          .from('accounts')
          .select('id')
          .eq('plaid_account_id', account.account_id)
          .single();

        const accountData = {
          plaid_account_id: account.account_id,
          connection_id: connection.id,
          name: account.name,
          official_name: account.official_name,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          balances: account.balances || {},
        };

        if (existingAccount) {
          await supabase
            .from('accounts')
            .update(accountData)
            .eq('id', existingAccount.id);
        } else {
          await supabase.from('accounts').insert(accountData);
        }
      }
    }

    return send(res, 200, {
      ok: true,
      connection: {
        id: connection.id,
        item_id: connection.item_id,
        institution_name: connection.institution_name,
        status: connection.status,
      },
    });
  } catch (error) {
    console.error('Error saving Plaid connection:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to save connection',
      details: error.message,
    });
  }
}