/**
 * Consolidated Plaid connection endpoint
 * Handles GET (connections) and POST (save connection)
 * Cloudflare Workers function
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

// GET handler
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

// POST handler
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