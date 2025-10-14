/**
 * @file functions/api/db/plaid.js
 * @description Cloudflare Worker function to manage Plaid connections in the database.
 * It handles GET requests to list all connections and POST requests to save or update
 * a connection, including access token encryption.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';
import { encryptJson } from '../../../src/lib/encryption.js';

/**
 * Handles GET requests to fetch all Plaid connections from the database.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response containing the list of Plaid connections.
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const supabase = createSupabaseAdmin(env);

    const { data: connections, error } = await supabase
      .from('plaid_connections')
      .select('*')
      .order('connected_at', { ascending: false });

    if (error) throw error;

    return jsonResponse({
      ok: true,
      connections: connections || [],
    }, 200, env);

  } catch (error) {
    console.error('Error in plaid GET:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}

/**
 * Handles POST requests to save or update a Plaid connection.
 * It encrypts the access token and then creates or updates the corresponding
 * record in the database.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response indicating whether the connection was created or updated.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const body = await request.json();
    const {
      access_token,
      item_id,
      institution_id,
      institution_name,
      accounts,
    } = body;

    if (!access_token || !item_id) {
      return jsonResponse({
        ok: false,
        error: 'Missing required fields: access_token, item_id',
      }, 400, env);
    }

    // SECURITY: Encrypt the access token before storing it
    const encryptedToken = await encryptJson({ token: access_token }, env);

    const supabase = createSupabaseAdmin(env);

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
          access_token: encryptedToken,
          institution_id,
          institution_name,
          accounts,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return jsonResponse({
        ok: true,
        connection: updated,
        action: 'updated',
      }, 200, env);
    } else {
      // Insert new connection
      const { data: inserted, error: insertError } = await supabase
        .from('plaid_connections')
        .insert({
          access_token: encryptedToken,
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

      return jsonResponse({
        ok: true,
        connection: inserted,
        action: 'created',
      }, 201, env);
    }

  } catch (error) {
    console.error('Error in plaid POST:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}