/**
 * @file functions/api/snapshots/save.js
 * @description Cloudflare Worker function to calculate and save daily portfolio snapshots.
 * This captures the portfolio value at a point in time using current prices.
 *
 * Features:
 * - Fetches all transactions and calculates current holdings
 * - Gets live prices for all holdings
 * - Calculates portfolio totals (market value, cost basis, gain/loss)
 * - Saves snapshot to portfolio_snapshots and holdings_snapshots tables
 * - Prevents duplicate snapshots for the same date
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';
import { aggregatePortfolio } from '../../../src/utils/parseTransactions.js';

/**
 * Checks if the US stock market is currently open based on UTC time.
 * @returns {string} 'open', 'closed', 'pre-market', or 'after-hours'
 */
function getMarketStatus() {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  // Weekend
  if (day === 0 || day === 6) {
    return 'closed';
  }

  const currentMinutes = hour * 60 + minute;
  const marketOpen = 13 * 60 + 30; // 13:30 UTC (9:30 AM ET)
  const marketClose = 20 * 60; // 20:00 UTC (4:00 PM ET)
  const preMarketStart = 9 * 60; // 9:00 UTC (5:00 AM ET)
  const afterHoursEnd = 24 * 60; // Midnight UTC (8:00 PM ET)

  if (currentMinutes >= marketOpen && currentMinutes < marketClose) {
    return 'open';
  } else if (currentMinutes >= preMarketStart && currentMinutes < marketOpen) {
    return 'pre-market';
  } else if (currentMinutes >= marketClose && currentMinutes < afterHoursEnd) {
    return 'after-hours';
  }

  return 'closed';
}

/**
 * Fetches live ETF prices from the current_etf_prices table
 */
async function getLivePrices(supabase) {
  const { data, error } = await supabase
    .from('current_etf_prices')
    .select('ticker, price, updated_at, change_percent');

  if (error) {
    console.error('Error fetching live prices:', error);
    return null;
  }

  // Convert to the format expected by aggregatePortfolio
  const prices = {};
  for (const row of data || []) {
    prices[row.ticker] = {
      price: parseFloat(row.price),
      updatedAt: row.updated_at,
      changePercent: row.change_percent,
    };
  }

  return prices;
}

/**
 * Converts portfolio structure to flat array of holdings
 */
function convertPortfolioToHoldings(portfolio) {
  const holdings = [];

  for (const [fund, sources] of Object.entries(portfolio.portfolio || {})) {
    for (const [source, position] of Object.entries(sources)) {
      if (!position.isClosed && Math.abs(position.shares) > 0.0001) {
        holdings.push({
          fund,
          accountName: source,
          shares: position.shares,
          marketValue: position.marketValue,
          costBasis: position.costBasis,
          gainLoss: position.gainLoss,
          avgCost: position.avgCost,
          latestNAV: position.latestNAV,
          priceInfo: position.priceInfo || { source: 'transaction' },
        });
      }
    }
  }

  return holdings;
}

/**
 * POST handler - Save a portfolio snapshot
 */
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

    // Parse request body for optional snapshot date (defaults to today)
    let snapshotDate = new Date().toISOString().split('T')[0];
    let snapshotSource = 'automated';

    try {
      const body = await request.json();
      if (body.date) {
        snapshotDate = body.date;
      }
      if (body.source) {
        snapshotSource = body.source;
      }
    } catch (e) {
      // No body or invalid JSON - use defaults
    }

    console.log(`📸 Creating portfolio snapshot for ${snapshotDate}...`);

    // Check if snapshot already exists for this date
    const { data: existingSnapshot } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date')
      .eq('snapshot_date', snapshotDate)
      .single();

    if (existingSnapshot) {
      console.log(`⚠️ Snapshot already exists for ${snapshotDate}`);
      return jsonResponse({
        ok: false,
        error: 'Snapshot already exists for this date',
        date: snapshotDate,
      }, 409, env);
    }

    // Fetch all transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: true });

    if (txError) {
      throw new Error(`Failed to fetch transactions: ${txError.message}`);
    }

    if (!transactions || transactions.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'No transactions found',
      }, 400, env);
    }

    // Fetch live prices
    const livePrices = await getLivePrices(supabase);
    console.log('💰 Current ETF prices:', livePrices ? Object.keys(livePrices).length : 0, 'tickers');

    // Normalize transactions to match expected format
    const normalizedTransactions = transactions.map(tx => ({
      date: tx.date,
      fund: tx.fund,
      moneySource: tx.money_source || 'Unknown',
      activity: tx.activity,
      units: parseFloat(tx.units) || 0,
      unitPrice: parseFloat(tx.unit_price) || 0,
      amount: parseFloat(tx.amount) || 0,
    }));

    // Aggregate portfolio using live prices
    const portfolio = aggregatePortfolio(normalizedTransactions, livePrices);
    const holdings = convertPortfolioToHoldings(portfolio);

    console.log(`📊 Portfolio: ${holdings.length} holdings, $${portfolio.totals.marketValue.toFixed(2)} market value`);

    // Calculate totals
    const totalMarketValue = portfolio.totals.marketValue;
    const totalCostBasis = portfolio.totals.costBasis;
    const totalGainLoss = portfolio.totals.gainLoss;
    const totalGainLossPercent = totalCostBasis > 0
      ? ((totalGainLoss / totalCostBasis) * 100)
      : 0;

    const marketStatus = getMarketStatus();

    // Insert portfolio snapshot
    const { data: snapshotData, error: snapshotError } = await supabase
      .from('portfolio_snapshots')
      .insert({
        snapshot_date: snapshotDate,
        snapshot_time: new Date().toISOString(),
        total_market_value: totalMarketValue,
        total_cost_basis: totalCostBasis,
        total_gain_loss: totalGainLoss,
        total_gain_loss_percent: totalGainLossPercent,
        cumulative_contributions: portfolio.totals.contributions || 0,
        cumulative_withdrawals: 0,
        snapshot_source: snapshotSource,
        market_status: marketStatus,
        metadata: {
          holdings_count: holdings.length,
          live_prices_used: livePrices ? Object.keys(livePrices).length : 0,
        },
      })
      .select()
      .single();

    if (snapshotError) {
      throw new Error(`Failed to insert portfolio snapshot: ${snapshotError.message}`);
    }

    console.log(`✅ Portfolio snapshot created for ${snapshotDate}`);

    // Insert holdings snapshots
    const holdingsSnapshots = holdings.map(holding => ({
      snapshot_date: snapshotDate,
      fund: holding.fund,
      account_name: holding.accountName,
      shares: holding.shares,
      unit_price: holding.latestNAV,
      market_value: holding.marketValue,
      cost_basis: holding.costBasis,
      gain_loss: holding.gainLoss,
      price_source: holding.priceInfo?.source || 'transaction',
      price_timestamp: holding.priceInfo?.timestamp || null,
      metadata: {},
    }));

    const { error: holdingsError } = await supabase
      .from('holdings_snapshots')
      .insert(holdingsSnapshots);

    if (holdingsError) {
      throw new Error(`Failed to insert holdings snapshots: ${holdingsError.message}`);
    }

    console.log(`✅ ${holdingsSnapshots.length} holdings snapshots saved`);

    return jsonResponse({
      ok: true,
      snapshot: {
        date: snapshotDate,
        marketValue: totalMarketValue,
        costBasis: totalCostBasis,
        gainLoss: totalGainLoss,
        gainLossPercent: totalGainLossPercent,
        holdingsCount: holdings.length,
        marketStatus,
      },
    }, 200, env);

  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to save snapshot',
      details: error.message,
    }, 500, env);
  }
}
