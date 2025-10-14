/**
 * @file functions/api/plaid/save-connection.js
 * @description Cloudflare Worker function to securely save Plaid connection details
 * to the database. It encrypts the `access_token` before storing it.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { jsonResponse, requireSharedToken, handleCors } from '../../../src/utils/cors-workers.js';
import { encryptJson } from '../../../src/lib/encryption.js';

/**
 * Handles POST requests to save a new or updated Plaid connection.
 * @param {object} context - The Cloudflare Worker context object.
 * @param {Request} context.request - The incoming request, containing the Plaid connection data.
 * @param {object} context.env - The environment variables.
 * @returns {Response} A JSON response indicating success or failure.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  // Validate authentication
  const authCheck = requireSharedToken(request, env);
  if (!authCheck.ok) {
    return jsonResponse({ ok: false, error: authCheck.message }, authCheck.status, env);
  }

  try {
    const body = await request.json();
    const { access_token, item_id, institution_name, institution_id } = body;

    if (!access_token || !item_id) {
      return jsonResponse({ ok: false, error: 'Missing required fields: access_token, item_id' }, 400, env);
    }

    // SECURITY: Encrypt the access token before storing it
    const encryptedToken = await encryptJson({ token: access_token }, env);

    const supabase = createSupabaseAdmin(env);

    // Insert or update connection in database with encrypted token
    const { data, error } = await supabase
      .from('plaid_connections')
      .upsert({
        item_id,
        access_token: encryptedToken,
        institution_name: institution_name || 'Unknown Institution',
        institution_id: institution_id || null,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'item_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving connection:', error);
      return jsonResponse({ ok: false, error: error.message }, 500, env);
    }

    console.log(`✅ Saved Plaid connection for ${institution_name || 'Unknown Institution'} (encrypted)`);

    return jsonResponse({
      ok: true,
      connection: data
    }, 200, env);
  } catch (error) {
    console.error('❌ Error in save-connection endpoint:', error);
    return jsonResponse({
      ok: false,
      error: error.message
    }, 500, env);
  }
}