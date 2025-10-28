/**
 * Get Holdings Snapshots
 * Returns current holdings and historical snapshots for charts
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

    const daysBack = parseInt(params.get('days') || '90');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const supabase = createSupabaseAdmin(env);

    // Get portfolio snapshots for timeline (aggregated daily values)
    const { data: portfolioSnapshots, error: portfolioError } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_market_value, total_cost_basis, total_gain_loss')
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true });

    if (portfolioError) throw portfolioError;

    // Get holdings snapshots for the most recent date to show current holdings
    const { data: latestSnapshot } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    let currentHoldings = [];
    let totalMarketValue = 0;
    let totalCostBasis = 0;

    if (latestSnapshot) {
      const { data: holdingsData, error: holdingsError } = await supabase
        .from('holdings_snapshots')
        .select('*')
        .eq('snapshot_date', latestSnapshot.snapshot_date);

      if (holdingsError) throw holdingsError;

      currentHoldings = (holdingsData || []).map(h => ({
        fund: h.fund,
        accountName: h.account_name,
        shares: parseFloat(h.shares),
        unitPrice: parseFloat(h.unit_price),
        marketValue: parseFloat(h.market_value),
        costBasis: parseFloat(h.cost_basis),
        gainLoss: parseFloat(h.gain_loss),
      }));

      totalMarketValue = currentHoldings.reduce((sum, h) => sum + h.marketValue, 0);
      totalCostBasis = currentHoldings.reduce((sum, h) => sum + h.costBasis, 0);
    }

    // Format timeline for charts
    const timeline = (portfolioSnapshots || []).map(snapshot => ({
      date: snapshot.snapshot_date,
      marketValue: parseFloat(snapshot.total_market_value),
      costBasis: parseFloat(snapshot.total_cost_basis),
      gainLoss: parseFloat(snapshot.total_gain_loss),
    }));

    return jsonResponse({
      ok: true,
      currentHoldings,
      timeline,
      totals: {
        marketValue: totalMarketValue,
        costBasis: totalCostBasis,
        gainLoss: totalMarketValue - totalCostBasis,
        totalHoldings: currentHoldings.length,
        lastUpdated: latestSnapshot?.snapshot_date || null,
      },
    }, 200, env);

  } catch (error) {
    console.error('Error fetching holdings snapshots:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to fetch holdings',
      details: error.message,
    }, 500, env);
  }
}