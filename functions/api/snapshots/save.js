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

class SnapshotExistsError extends Error {
  constructor(date) {
    super(`Snapshot already exists for ${date}`);
    this.name = 'SnapshotExistsError';
    this.status = 409;
  }
}

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

async function deleteSnapshotData(supabase, snapshotDate) {
  console.log(`♻️ Removing existing snapshot data for ${snapshotDate}`);

  const { error: holdingsError } = await supabase
    .from('holdings_snapshots')
    .delete()
    .eq('snapshot_date', snapshotDate);

  if (holdingsError) {
    throw new Error(`Failed to delete holdings snapshots for ${snapshotDate}: ${holdingsError.message}`);
  }

  const { error: fundError } = await supabase
    .from('fund_snapshots')
    .delete()
    .eq('snapshot_date', snapshotDate);

  if (fundError) {
    throw new Error(`Failed to delete fund snapshots for ${snapshotDate}: ${fundError.message}`);
  }

  const { error: portfolioError } = await supabase
    .from('portfolio_snapshots')
    .delete()
    .eq('snapshot_date', snapshotDate);

  if (portfolioError) {
    throw new Error(`Failed to delete portfolio snapshot for ${snapshotDate}: ${portfolioError.message}`);
  }
}

export async function createSnapshot(env, options = {}) {
  const supabase = options.supabase || createSupabaseAdmin(env);
  const snapshotDate = options.snapshotDate || new Date().toISOString().split('T')[0];
  const snapshotSource = options.snapshotSource || 'automated';
  const force = Boolean(options.force);

  console.log(`📸 Creating portfolio snapshot for ${snapshotDate}${force ? ' (force)' : ''}...`);

  const { data: existingSnapshot, error: existingError } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date')
    .eq('snapshot_date', snapshotDate)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check existing snapshot: ${existingError.message}`);
  }

  if (existingSnapshot) {
    if (!force) {
      throw new SnapshotExistsError(snapshotDate);
    }
    await deleteSnapshotData(supabase, snapshotDate);
  }

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .lte('date', snapshotDate)
    .order('date', { ascending: true });

  if (txError) {
    throw new Error(`Failed to fetch transactions: ${txError.message}`);
  }

  if (!transactions || transactions.length === 0) {
    throw new Error(`No transactions found on or before ${snapshotDate}`);
  }

  const livePrices = await getLivePrices(supabase);
  console.log('💰 Current ETF prices:', livePrices ? Object.keys(livePrices).length : 0, 'tickers');

  const normalizedTransactions = transactions.map(tx => ({
    date: tx.date,
    fund: tx.fund,
    moneySource: tx.money_source || 'Unknown',
    activity: tx.activity,
    units: parseFloat(tx.units) || 0,
    unitPrice: parseFloat(tx.unit_price) || 0,
    amount: parseFloat(tx.amount) || 0,
  }));

  const portfolio = aggregatePortfolio(normalizedTransactions, livePrices);
  const holdings = convertPortfolioToHoldings(portfolio);

  console.log(`📊 Portfolio: ${holdings.length} holdings, $${portfolio.totals.marketValue.toFixed(2)} market value`);

  const totalMarketValue = portfolio.totals.marketValue;
  const totalCostBasis = portfolio.totals.costBasis;
  const totalGainLoss = portfolio.totals.gainLoss;
  const totalGainLossPercent = totalCostBasis > 0
    ? ((totalGainLoss / totalCostBasis) * 100)
    : 0;

  const marketStatus = getMarketStatus();

  const { error: snapshotError } = await supabase
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
    });

  if (snapshotError) {
    throw new Error(`Failed to insert portfolio snapshot: ${snapshotError.message}`);
  }

  console.log(`✅ Portfolio snapshot saved for ${snapshotDate}`);

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

  const fundAggregates = {};
  for (const holding of holdings) {
    const ticker = holding.fund;
    if (!fundAggregates[ticker]) {
      fundAggregates[ticker] = {
        ticker,
        fund_name: ticker,
        shares: 0,
        cost_basis: 0,
        market_value: 0,
        current_price: holding.latestNAV,
      };
    }
    fundAggregates[ticker].shares += holding.shares;
    fundAggregates[ticker].cost_basis += holding.costBasis;
    fundAggregates[ticker].market_value += holding.marketValue;
    fundAggregates[ticker].current_price = holding.latestNAV;
  }

  const fundSnapshots = Object.values(fundAggregates).map(fund => {
    const avgCostPerShare = fund.shares > 0 ? fund.cost_basis / fund.shares : 0;
    const gainLoss = fund.market_value - fund.cost_basis;
    const gainLossPercent = fund.cost_basis > 0 ? (gainLoss / fund.cost_basis) * 100 : 0;

    return {
      snapshot_date: snapshotDate,
      snapshot_time: new Date().toISOString(),
      ticker: fund.ticker,
      fund_name: fund.fund_name,
      shares: fund.shares,
      cost_basis: fund.cost_basis,
      market_value: fund.market_value,
      avg_cost_per_share: avgCostPerShare,
      current_price: fund.current_price,
      gain_loss: gainLoss,
      gain_loss_percent: gainLossPercent,
    };
  });

  if (fundSnapshots.length > 0) {
    const { error: fundSnapshotsError } = await supabase
      .from('fund_snapshots')
      .insert(fundSnapshots);

    if (fundSnapshotsError) {
      console.error('⚠️ Failed to insert fund snapshots:', fundSnapshotsError.message);
    } else {
      console.log(`✅ ${fundSnapshots.length} fund snapshots saved`);
    }
  }

  return {
    date: snapshotDate,
    marketValue: totalMarketValue,
    costBasis: totalCostBasis,
    gainLoss: totalGainLoss,
    gainLossPercent: totalGainLossPercent,
    holdingsCount: holdings.length,
    fundSnapshotsCount: fundSnapshots.length,
    marketStatus,
  };
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
    let snapshotDate = new Date().toISOString().split('T')[0];
    let snapshotSource = 'automated';
    let force = false;

    try {
      const body = await request.json();
      if (body.date) {
        snapshotDate = body.date;
      }
      if (body.source) {
        snapshotSource = body.source;
      }
      if (typeof body.force === 'boolean') {
        force = body.force;
      }
    } catch (e) {
      // No body or invalid JSON - use defaults
    }

    const snapshot = await createSnapshot(env, {
      snapshotDate,
      snapshotSource,
      force,
    });

    return jsonResponse({
      ok: true,
      snapshot,
    }, 200, env);

  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);

    const status = error.status || 500;
    return jsonResponse({
      ok: false,
      error: status === 409 ? 'Snapshot already exists for this date' : 'Failed to save snapshot',
      details: error.message,
    }, status, env);
  }
}
