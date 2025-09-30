import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { jsonResponse, requireSharedToken, handleCors } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
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