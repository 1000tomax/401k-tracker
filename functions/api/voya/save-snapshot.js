/**
 * Save Voya Snapshot to Database
 * Saves manually imported Voya holdings to holdings_snapshots table
 */
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
    const body = await request.json();
    const { snapshot } = body;

    if (!snapshot) {
      return jsonResponse({
        ok: false,
        error: 'Missing snapshot data'
      }, 400, env);
    }

    // Validate snapshot structure
    if (!snapshot.holdings || !Array.isArray(snapshot.holdings) || snapshot.holdings.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'Invalid snapshot: missing holdings'
      }, 400, env);
    }

    if (!snapshot.sources || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'Invalid snapshot: missing sources'
      }, 400, env);
    }

    const supabase = createSupabaseAdmin(env);

    // Use snapshot date or today
    const snapshotDate = snapshot.timestamp
      ? new Date(snapshot.timestamp).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    console.log(`💾 Saving Voya snapshot for ${snapshotDate}`);

    const snapshots = [];
    const errors = [];

    // Process each source as a separate holding
    // This allows tracking PreTax, Roth, and Match balances separately over time
    for (const source of snapshot.sources) {
      // Get the main holding (VFIAX)
      const holding = snapshot.holdings[0]; // Assuming single fund

      if (!holding) {
        console.error('No holding found for source:', source.name);
        continue;
      }

      // Calculate shares for this source based on proportion
      // source.balance / total balance * total shares
      const totalBalance = snapshot.account.balance;
      const sourceShares = (source.balance / totalBalance) * holding.shares;

      // Create account_id that includes source type for uniqueness
      // Format: voya_401k_pretax, voya_401k_roth, voya_401k_match
      const sourceType = source.name.toLowerCase()
        .replace(/employee pretax/i, 'pretax')
        .replace(/roth/i, 'roth')
        .replace(/safe harbor match/i, 'match')
        .replace(/employer match/i, 'match')
        .replace(/\s+/g, '_');

      const accountId = `voya_401k_${sourceType}`;

      // Account name includes source for clarity
      const accountName = `${snapshot.account.name} (${source.name})`;

      const holdingSnapshot = {
        snapshot_date: snapshotDate,
        account_id: accountId,
        account_name: accountName,
        fund: holding.ticker,
        shares: sourceShares,
        unit_price: holding.price,
        market_value: source.balance,
      };

      snapshots.push(holdingSnapshot);

      // Upsert snapshot (update if exists for today, insert if not)
      const { error: insertError } = await supabase
        .from('holdings_snapshots')
        .upsert(holdingSnapshot, {
          onConflict: 'snapshot_date,account_id,fund',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('Error saving Voya snapshot:', insertError);
        errors.push({
          source: source.name,
          error: insertError.message,
        });
      } else {
        console.log(`✅ Saved Voya snapshot: ${source.name} - ${holding.ticker} - $${source.balance}`);
      }
    }

    if (errors.length > 0) {
      return jsonResponse({
        ok: false,
        error: 'Failed to save some snapshots',
        details: errors,
        saved: snapshots.length - errors.length,
        total: snapshots.length,
      }, 500, env);
    }

    return jsonResponse({
      ok: true,
      message: 'Voya snapshot saved successfully',
      saved: snapshots.length,
      snapshot_date: snapshotDate,
      snapshots: snapshots.map(s => ({
        account: s.account_name,
        fund: s.fund,
        shares: s.shares,
        market_value: s.market_value,
      })),
    }, 200, env);

  } catch (error) {
    console.error('❌ Failed to save Voya snapshot:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to save snapshot',
      details: error.message,
    }, 500, env);
  }
}
