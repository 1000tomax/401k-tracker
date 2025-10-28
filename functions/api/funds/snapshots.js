/**
 * Get Fund Snapshots
 * Returns historical snapshots for a specific fund ticker
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const url = new URL(request.url);
    const params = url.searchParams;

    const ticker = params.get('ticker');
    if (!ticker) {
      return jsonResponse({
        ok: false,
        error: 'Missing required parameter: ticker',
      }, 400, env);
    }

    const daysBack = parseInt(params.get('days') || '365');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const supabase = createSupabaseAdmin(env);

    // Get fund snapshots for this ticker
    const { data: fundSnapshots, error: snapshotsError } = await supabase
      .from('fund_snapshots')
      .select('*')
      .eq('ticker', ticker)
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true });

    if (snapshotsError) throw snapshotsError;

    if (!fundSnapshots || fundSnapshots.length === 0) {
      return jsonResponse({
        ok: true,
        timeline: [],
        latest: null,
        message: 'No snapshots found for this ticker',
      }, 200, env);
    }

    // Format timeline for charts
    const timeline = fundSnapshots.map(snapshot => ({
      date: snapshot.snapshot_date,
      shares: parseFloat(snapshot.shares),
      costBasis: parseFloat(snapshot.cost_basis),
      marketValue: parseFloat(snapshot.market_value),
      avgCost: parseFloat(snapshot.avg_cost_per_share),
      price: parseFloat(snapshot.current_price),
      gainLoss: parseFloat(snapshot.gain_loss),
      gainLossPercent: parseFloat(snapshot.gain_loss_percent),
    }));

    // Get the latest snapshot
    const latest = timeline[timeline.length - 1];

    return jsonResponse({
      ok: true,
      ticker,
      timeline,
      latest: {
        date: fundSnapshots[fundSnapshots.length - 1].snapshot_date,
        shares: latest.shares,
        costBasis: latest.costBasis,
        marketValue: latest.marketValue,
        avgCost: latest.avgCost,
        currentPrice: latest.price,
        gainLoss: latest.gainLoss,
        gainLossPercent: latest.gainLossPercent,
      },
      stats: {
        snapshotCount: timeline.length,
        firstDate: fundSnapshots[0].snapshot_date,
        lastDate: fundSnapshots[fundSnapshots.length - 1].snapshot_date,
      },
    }, 200, env);

  } catch (error) {
    console.error('Error fetching fund snapshots:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to fetch fund snapshots',
      details: error.message,
    }, 500, env);
  }
}
