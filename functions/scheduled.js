/**
 * Cloudflare Scheduled Worker - Daily Holdings Sync
 * Runs daily to fetch current holdings from Plaid and save snapshots
 */
import { initializePlaidClient } from '../lib/plaidConfig.js';
import { createSupabaseAdmin } from '../src/lib/supabaseAdmin.js';

export default {
  async scheduled(event, env, ctx) {
    console.log('🕐 Starting scheduled holdings sync', new Date().toISOString());

    try {
      const supabase = createSupabaseAdmin(env);
      const { plaidClient } = initializePlaidClient(env);

      // Get all active Plaid connections
      const { data: connections, error: dbError } = await supabase
        .from('plaid_connections')
        .select('*');

      if (dbError) throw dbError;

      if (!connections || connections.length === 0) {
        console.log('⚠️ No Plaid connections found');
        return;
      }

      console.log(`📊 Syncing holdings for ${connections.length} connection(s)`);

      const today = new Date().toISOString().split('T')[0];
      let totalHoldings = 0;
      let errors = 0;

      for (const connection of connections) {
        try {
          // Fetch holdings from Plaid
          const response = await plaidClient.investmentsHoldingsGet({
            access_token: connection.access_token,
          });

          const { accounts, holdings, securities } = response.data;

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
              errors++;
            } else {
              totalHoldings++;
            }
          }

          // Update last_synced_at for this connection
          await supabase
            .from('plaid_connections')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', connection.id);

          console.log(`✅ Synced ${holdings.length} holdings for ${connection.institution_name}`);

        } catch (error) {
          console.error(`❌ Error syncing ${connection.institution_name}:`, error.message);
          errors++;
        }
      }

      console.log(`✅ Sync complete: ${totalHoldings} holdings saved, ${errors} errors`);

    } catch (error) {
      console.error('❌ Scheduled sync failed:', error);
    }
  },
};