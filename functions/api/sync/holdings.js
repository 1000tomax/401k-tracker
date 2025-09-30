/**
 * Manual Holdings Sync Endpoint
 * Triggers an immediate sync of all Plaid holdings
 */
import { initializePlaidClient } from '../../../lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const supabase = createSupabaseAdmin(env);
    const { plaidClient } = initializePlaidClient(env);

    // Get all active Plaid connections
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*');

    if (dbError) throw dbError;

    if (!connections || connections.length === 0) {
      return jsonResponse({
        ok: true,
        message: 'No Plaid connections found',
        synced: 0,
      }, 200, env);
    }

    console.log(`📊 Manual sync: Processing ${connections.length} connection(s)`);

    const today = new Date().toISOString().split('T')[0];
    let totalHoldings = 0;
    const errors = [];
    const results = [];

    for (const connection of connections) {
      try {
        // Fetch holdings from Plaid
        const response = await plaidClient.investmentsHoldingsGet({
          access_token: connection.access_token,
        });

        const { accounts, holdings, securities } = response.data;
        let connectionHoldings = 0;

        // Process each holding
        for (const holding of holdings) {
          const account = accounts.find(a => a.account_id === holding.account_id);
          const security = securities.find(s => s.security_id === holding.security_id);

          if (!account || !security) continue;

          const snapshot = {
            snapshot_date: today,
            account_id: holding.account_id,
            account_name: account.name,
            fund: security.ticker_symbol || security.name,
            shares: holding.quantity,
            unit_price: holding.institution_price,
            market_value: holding.institution_value,
          };

          // Upsert snapshot (update if exists for today, insert if not)
          const { error: insertError } = await supabase
            .from('holdings_snapshots')
            .upsert(snapshot, {
              onConflict: 'snapshot_date,account_id,fund',
              ignoreDuplicates: false,
            });

          if (insertError) {
            console.error('Error saving snapshot:', insertError);
            errors.push({
              institution: connection.institution_name,
              fund: snapshot.fund,
              error: insertError.message,
            });
          } else {
            connectionHoldings++;
            totalHoldings++;
          }
        }

        // Update last_synced_at for this connection
        await supabase
          .from('plaid_connections')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', connection.id);

        results.push({
          institution: connection.institution_name,
          holdings_synced: connectionHoldings,
        });

        console.log(`✅ Synced ${connectionHoldings} holdings for ${connection.institution_name}`);

      } catch (error) {
        console.error(`❌ Error syncing ${connection.institution_name}:`, error.message);
        errors.push({
          institution: connection.institution_name,
          error: error.message,
        });
      }
    }

    return jsonResponse({
      ok: true,
      message: 'Holdings sync complete',
      synced: totalHoldings,
      results,
      errors: errors.length > 0 ? errors : undefined,
      snapshot_date: today,
    }, 200, env);

  } catch (error) {
    console.error('❌ Manual holdings sync failed:', error);
    return jsonResponse({
      ok: false,
      error: 'Sync failed',
      details: error.message,
    }, 500, env);
  }
}