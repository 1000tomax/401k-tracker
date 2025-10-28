/**
 * @file functions/api/snapshots/backfill.js
 * @description Backfills historical portfolio snapshots by replaying transactions.
 * This generates snapshots for each day from the first transaction to today,
 * calculating what the portfolio value would have been on each date using the
 * last known NAV for each holding.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * Ensures a value is a valid number, returning 0 for invalid inputs
 */
function ensureNumber(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Classifies a transaction activity into cash flow type
 */
function classifyFlow(activity) {
  const normalized = (activity || '').toLowerCase().trim();

  const depositPatterns = [
    'contribution', 'deposit', 'rollover in', 'transfer in',
    'fund transfer in', 'interest', 'dividend reinvestment'
  ];
  const withdrawalPatterns = ['withdrawal', 'distribution', 'rollover out', 'transfer out', 'fund transfer out'];

  if (depositPatterns.some(p => normalized.includes(p))) return 'deposit';
  if (withdrawalPatterns.some(p => normalized.includes(p))) return 'withdrawal';
  return 'neutral';
}

/**
 * Generates all dates between start and end (inclusive)
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * POST handler - Backfill historical snapshots
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

    // Parse request options
    let startDate = null;
    let endDate = new Date().toISOString().split('T')[0];

    try {
      const body = await request.json();
      if (body.startDate) startDate = body.startDate;
      if (body.endDate) endDate = body.endDate;
    } catch (e) {
      // Use defaults
    }

    console.log(`📸 Backfilling portfolio snapshots...`);

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

    // Determine date range
    if (!startDate) {
      startDate = transactions[0].date;
    }

    console.log(`📅 Backfilling from ${startDate} to ${endDate}`);

    // Generate all dates in range
    const allDates = generateDateRange(startDate, endDate);
    console.log(`📆 Processing ${allDates.length} dates`);

    // Check which snapshots already exist
    const { data: existingSnapshots } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate);

    const existingDates = new Set((existingSnapshots || []).map(s => s.snapshot_date));
    const datesToProcess = allDates.filter(date => !existingDates.has(date));

    console.log(`⏭️ Skipping ${existingDates.size} existing snapshots`);
    console.log(`✨ Creating ${datesToProcess.length} new snapshots`);

    if (datesToProcess.length === 0) {
      return jsonResponse({
        ok: true,
        message: 'All snapshots already exist',
        skipped: existingDates.size,
      }, 200, env);
    }

    // Track running position for each fund/account combination
    const positions = new Map();
    let cumulativeContributions = 0;
    let cumulativeWithdrawals = 0;

    let created = 0;
    let errors = 0;

    // Process transactions chronologically
    for (const date of datesToProcess) {
      // Apply all transactions for this date
      const txsForDate = transactions.filter(tx => tx.date === date);

      for (const tx of txsForDate) {
        const key = `${tx.fund}||${tx.money_source || 'Unknown'}`;
        if (!positions.has(key)) {
          positions.set(key, {
            fund: tx.fund,
            accountName: tx.money_source || 'Unknown',
            shares: 0,
            costBasis: 0,
            latestNAV: 0,
          });
        }

        const position = positions.get(key);
        const units = ensureNumber(tx.units);
        const amount = ensureNumber(tx.amount);
        const unitPrice = ensureNumber(tx.unit_price);
        const flowType = classifyFlow(tx.activity);
        const magnitude = Math.abs(amount);

        // Track cash flows
        if (flowType === 'deposit' && magnitude > 0) {
          cumulativeContributions += magnitude;
        } else if (flowType === 'withdrawal' && magnitude > 0) {
          cumulativeWithdrawals += magnitude;
        }

        // Update position
        if (units > 0) {
          // Buy
          const purchaseCost = magnitude > 0 ? magnitude : Math.abs(units * unitPrice);
          position.costBasis += purchaseCost;
          position.shares += units;
        } else if (units < 0 && position.shares > 0) {
          // Sell
          const avgCost = position.costBasis / position.shares;
          const costReduction = avgCost * Math.min(Math.abs(units), position.shares);
          position.costBasis = Math.max(0, position.costBasis - costReduction);
          position.shares = Math.max(0, position.shares - Math.abs(units));
        }

        // Update latest NAV
        if (unitPrice > 0) {
          position.latestNAV = unitPrice;
        }
      }

      // Calculate snapshot for this date
      const holdings = [];
      let totalMarketValue = 0;
      let totalCostBasis = 0;

      for (const position of positions.values()) {
        if (Math.abs(position.shares) > 0.0001) {
          const marketValue = position.shares * position.latestNAV;
          const gainLoss = marketValue - position.costBasis;

          totalMarketValue += marketValue;
          totalCostBasis += position.costBasis;

          holdings.push({
            fund: position.fund,
            accountName: position.accountName,
            shares: position.shares,
            unitPrice: position.latestNAV,
            marketValue,
            costBasis: position.costBasis,
            gainLoss,
          });
        }
      }

      const totalGainLoss = totalMarketValue - totalCostBasis;
      const totalGainLossPercent = totalCostBasis > 0
        ? ((totalGainLoss / totalCostBasis) * 100)
        : 0;

      // Insert portfolio snapshot
      try {
        const { error: snapshotError } = await supabase
          .from('portfolio_snapshots')
          .insert({
            snapshot_date: date,
            snapshot_time: new Date().toISOString(),
            total_market_value: totalMarketValue,
            total_cost_basis: totalCostBasis,
            total_gain_loss: totalGainLoss,
            total_gain_loss_percent: totalGainLossPercent,
            cumulative_contributions: cumulativeContributions,
            cumulative_withdrawals: cumulativeWithdrawals,
            snapshot_source: 'backfill',
            market_status: 'closed',
            metadata: {
              holdings_count: holdings.length,
              transaction_count: txsForDate.length,
            },
          });

        if (snapshotError) {
          console.error(`Error creating snapshot for ${date}:`, snapshotError);
          errors++;
          continue;
        }

        // Insert holdings snapshots
        if (holdings.length > 0) {
          const holdingsSnapshots = holdings.map(h => ({
            snapshot_date: date,
            fund: h.fund,
            account_name: h.accountName,
            shares: h.shares,
            unit_price: h.unitPrice,
            market_value: h.marketValue,
            cost_basis: h.costBasis,
            gain_loss: h.gainLoss,
            price_source: 'transaction',
            price_timestamp: null,
            metadata: {},
          }));

          const { error: holdingsError } = await supabase
            .from('holdings_snapshots')
            .insert(holdingsSnapshots);

          if (holdingsError) {
            console.error(`Error creating holdings snapshots for ${date}:`, holdingsError);
            errors++;
          }
        }

        created++;

        // Log progress every 10 snapshots
        if (created % 10 === 0) {
          console.log(`📸 Progress: ${created}/${datesToProcess.length} snapshots created`);
        }

      } catch (error) {
        console.error(`Error processing date ${date}:`, error);
        errors++;
      }
    }

    console.log(`✅ Backfill complete: ${created} created, ${errors} errors`);

    return jsonResponse({
      ok: true,
      created,
      errors,
      skipped: existingDates.size,
      total: allDates.length,
    }, 200, env);

  } catch (error) {
    console.error('Error backfilling snapshots:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to backfill snapshots',
      details: error.message,
    }, 500, env);
  }
}
