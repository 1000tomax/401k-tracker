/**
 * @file functions/api/emails/analytics/portfolio-summary.js
 * @description A reusable Cloudflare Worker endpoint that provides analytics for the portfolio.
 * It is used by other services, such as the email notification service, to get a summary
 * of the current portfolio state, recent transactions, and performance metrics.
 */
import { createSupabaseAdmin } from '../../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../../src/utils/cors-workers.js';
import { aggregatePortfolio } from '../../../../src/utils/parseTransactions.js';

/**
 * Handles GET requests to fetch portfolio summary analytics.
 * It calculates the current portfolio value, identifies recent transactions, and computes
 * year-to-date contributions to provide a comprehensive summary.
 *
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response containing the portfolio summary analytics.
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
    const url = new URL(request.url);
    const daysBack = parseInt(url.searchParams.get('days') || '1');
    const includeTransactions = url.searchParams.get('include_transactions') !== 'false';

    const supabase = createSupabaseAdmin(env);

    // Fetch all transactions for portfolio calculation
    const { data: allTransactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: true });

    if (txError) throw txError;

    // Fetch live ETF prices for Roth IRA holdings
    const { data: livePricesData, error: pricesError } = await supabase
      .from('current_etf_prices')
      .select('ticker, price, change_percent, updated_at');

    // Convert to map format expected by aggregatePortfolio
    const livePrices = {};
    if (livePricesData && !pricesError) {
      for (const row of livePricesData) {
        livePrices[row.ticker] = {
          price: parseFloat(row.price),
          changePercent: row.change_percent ? parseFloat(row.change_percent) : 0,
          updatedAt: row.updated_at,
        };
      }
    }

    // Calculate current portfolio state
    const portfolio = aggregatePortfolio(allTransactions, livePrices);

    // Get recent transactions (for transaction emails)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const recentTransactions = allTransactions.filter(tx => tx.date >= cutoffDateStr);

    // Calculate YTD contributions
    const currentYear = new Date().getFullYear();
    const ytdTransactions = allTransactions.filter(tx => {
      const txYear = new Date(tx.date).getFullYear();
      return txYear === currentYear;
    });

    const ytdContributions = ytdTransactions.reduce((sum, tx) => {
      // Count employee contributions and matches
      const activity = (tx.activity || '').toLowerCase();
      if (activity.includes('contribution') || activity.includes('match') ||
          activity.includes('purchased') || activity.includes('buy')) {
        return sum + Math.abs(parseFloat(tx.amount) || 0);
      }
      return sum;
    }, 0);

    // Group recent transactions by account and separate dividends
    const transactionsByAccount = {};
    const dividendsByAccount = {};

    for (const tx of recentTransactions) {
      const account = tx.money_source || 'Unknown';
      const activity = (tx.activity || '').toLowerCase();
      const isDividend = activity.includes('dividend') || activity.includes('distribution');

      const txData = {
        date: tx.date,
        activity: tx.activity,
        fund: tx.fund,
        amount: parseFloat(tx.amount),
        units: tx.units ? parseFloat(tx.units) : null,
        unitPrice: tx.unit_price ? parseFloat(tx.unit_price) : null,
      };

      if (isDividend) {
        if (!dividendsByAccount[account]) {
          dividendsByAccount[account] = [];
        }
        dividendsByAccount[account].push(txData);
      } else {
        if (!transactionsByAccount[account]) {
          transactionsByAccount[account] = [];
        }
        transactionsByAccount[account].push(txData);
      }
    }

    // Calculate totals
    const totalRecentAmount = recentTransactions
      .filter(tx => !(tx.activity || '').toLowerCase().includes('dividend'))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

    const totalDividends = recentTransactions
      .filter(tx => (tx.activity || '').toLowerCase().includes('dividend'))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);

    const response = {
      ok: true,
      portfolio: {
        totalValue: portfolio.totals.marketValue,
        costBasis: portfolio.totals.costBasis,
        gainLoss: portfolio.totals.gainLoss,
        gainLossPercent: portfolio.totals.costBasis > 0
          ? ((portfolio.totals.gainLoss / portfolio.totals.costBasis) * 100).toFixed(2)
          : '0.00',
      },
      ytdContributions,
      recentActivity: includeTransactions ? {
        daysBack,
        transactionCount: recentTransactions.length,
        totalAmount: totalRecentAmount,
        totalDividends,
        byAccount: transactionsByAccount,
        dividendsByAccount,
      } : null,
      asOf: new Date().toISOString(),
    };

    return jsonResponse(response, 200, env);

  } catch (error) {
    console.error('Error generating portfolio summary:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to generate portfolio summary',
      details: error.message,
    }, 500, env);
  }
}
