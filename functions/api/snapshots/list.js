/**
 * @file functions/api/snapshots/list.js
 * @description List all portfolio snapshots with summary data
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * GET handler - List all portfolio snapshots
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

    // Get all portfolio snapshots with holdings count
    const { data: snapshots, error } = await supabase
      .from('portfolio_snapshots')
      .select(`
        id,
        snapshot_date,
        snapshot_time,
        total_market_value,
        total_cost_basis,
        total_gain_loss,
        total_gain_loss_percent,
        cumulative_contributions,
        snapshot_source,
        market_status,
        metadata,
        created_at
      `)
      .order('snapshot_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }

    // Get holdings count for each snapshot
    const { data: holdingsCounts, error: holdingsError } = await supabase
      .from('holdings_snapshots')
      .select('snapshot_date')
      .order('snapshot_date');

    if (holdingsError) {
      console.error('Error fetching holdings counts:', holdingsError);
    }

    // Count holdings per snapshot date
    const holdingsCountMap = {};
    if (holdingsCounts) {
      for (const h of holdingsCounts) {
        holdingsCountMap[h.snapshot_date] = (holdingsCountMap[h.snapshot_date] || 0) + 1;
      }
    }

    // Format response
    const formattedSnapshots = (snapshots || []).map(snapshot => ({
      id: snapshot.id,
      date: snapshot.snapshot_date,
      time: snapshot.snapshot_time,
      marketValue: parseFloat(snapshot.total_market_value),
      costBasis: parseFloat(snapshot.total_cost_basis),
      gainLoss: parseFloat(snapshot.total_gain_loss),
      gainLossPercent: parseFloat(snapshot.total_gain_loss_percent || 0),
      contributions: parseFloat(snapshot.cumulative_contributions || 0),
      source: snapshot.snapshot_source,
      marketStatus: snapshot.market_status,
      holdingsCount: holdingsCountMap[snapshot.snapshot_date] || snapshot.metadata?.holdings_count || 0,
      createdAt: snapshot.created_at,
    }));

    return jsonResponse({
      ok: true,
      snapshots: formattedSnapshots,
      count: formattedSnapshots.length,
    }, 200, env);

  } catch (error) {
    console.error('Error listing snapshots:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to list snapshots',
      details: error.message,
    }, 500, env);
  }
}
