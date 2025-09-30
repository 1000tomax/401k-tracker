import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { jsonResponse, requireSharedToken, handleCors } from '../../../src/utils/cors-workers.js';

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
    const { item_id } = body;

    if (!item_id) {
      return jsonResponse({ ok: false, error: 'Missing required field: item_id' }, 400, env);
    }

    const supabase = createSupabaseAdmin(env);

    // Delete connection from database
    const { error } = await supabase
      .from('plaid_connections')
      .delete()
      .eq('item_id', item_id);

    if (error) {
      console.error('❌ Error removing connection:', error);
      return jsonResponse({ ok: false, error: error.message }, 500, env);
    }

    console.log(`✅ Removed Plaid connection: ${item_id}`);

    return jsonResponse({
      ok: true,
      message: 'Connection removed successfully'
    }, 200, env);
  } catch (error) {
    console.error('❌ Error in remove-connection endpoint:', error);
    return jsonResponse({
      ok: false,
      error: error.message
    }, 500, env);
  }
}