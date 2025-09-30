import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { jsonResponse, validateAuth } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Validate authentication
  const authError = validateAuth(request, env);
  if (authError) return authError;

  try {
    const supabase = createSupabaseAdmin(env);

    // Fetch all Plaid connections from database
    const { data: connections, error } = await supabase
      .from('plaid_connections')
      .select('id, item_id, institution_name, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching connections:', error);
      return jsonResponse({ ok: false, error: error.message }, 500, env);
    }

    console.log(`✅ Found ${connections?.length || 0} Plaid connections`);

    return jsonResponse({
      ok: true,
      connections: connections || []
    }, 200, env);
  } catch (error) {
    console.error('❌ Error in connections endpoint:', error);
    return jsonResponse({
      ok: false,
      error: error.message
    }, 500, env);
  }
}