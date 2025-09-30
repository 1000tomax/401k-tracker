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

    // Get all snapshots within date range
    const { data: snapshots, error } = await supabase
      .from('holdings_snapshots')
      .select('*')
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    // Group by date for chart data
    const byDate = new Map();
    const byFund = new Map();
    let latestDate = null;

    for (const snapshot of snapshots || []) {
      // Track latest date
      if (!latestDate || snapshot.snapshot_date > latestDate) {
        latestDate = snapshot.snapshot_date;
      }

      // Group by date for timeline
      if (!byDate.has(snapshot.snapshot_date)) {
        byDate.set(snapshot.snapshot_date, {
          date: snapshot.snapshot_date,
          marketValue: 0,
          holdings: [],
        });
      }
      const dateEntry = byDate.get(snapshot.snapshot_date);
      dateEntry.marketValue += parseFloat(snapshot.market_value);
      dateEntry.holdings.push({
        fund: snapshot.fund,
        accountName: snapshot.account_name,
        shares: parseFloat(snapshot.shares),
        unitPrice: parseFloat(snapshot.unit_price),
        marketValue: parseFloat(snapshot.market_value),
      });

      // Track by fund for current holdings
      if (snapshot.snapshot_date === latestDate) {
        const key = `${snapshot.fund}-${snapshot.account_id}`;
        if (!byFund.has(key)) {
          byFund.set(key, {
            fund: snapshot.fund,
            accountName: snapshot.account_name,
            shares: 0,
            marketValue: 0,
            unitPrice: parseFloat(snapshot.unit_price),
          });
        }
        const fundEntry = byFund.get(key);
        fundEntry.shares += parseFloat(snapshot.shares);
        fundEntry.marketValue += parseFloat(snapshot.market_value);
      }
    }

    // Convert to arrays
    const timeline = Array.from(byDate.values());
    const currentHoldings = Array.from(byFund.values());

    // Calculate totals
    const totalMarketValue = currentHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    return jsonResponse({
      ok: true,
      currentHoldings,
      timeline,
      totals: {
        marketValue: totalMarketValue,
        totalHoldings: currentHoldings.length,
        lastUpdated: latestDate,
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