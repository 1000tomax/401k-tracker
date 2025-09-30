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
    const supabase = createSupabaseAdmin(env);

    // Update all connections with NULL or 'Unknown Institution' to 'M1 Finance'
    const { data, error } = await supabase
      .from('plaid_connections')
      .update({ institution_name: 'M1 Finance' })
      .or('institution_name.is.null,institution_name.eq.Unknown Institution')
      .select();

    if (error) {
      console.error('❌ Error updating connections:', error);
      return jsonResponse({ ok: false, error: error.message }, 500, env);
    }

    console.log(`✅ Updated ${data?.length || 0} connections to M1 Finance`);

    return jsonResponse({
      ok: true,
      updated: data?.length || 0,
      connections: data
    }, 200, env);
  } catch (error) {
    console.error('❌ Error in fix-m1-name endpoint:', error);
    return jsonResponse({
      ok: false,
      error: error.message
    }, 500, env);
  }
}