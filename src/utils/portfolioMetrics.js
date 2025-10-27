/**
 * @file portfolioMetrics.js
 * @description Utility functions for calculating advanced portfolio metrics.
 */

/**
 * Fund expense ratios (as of 2025)
 * Source: Fund prospectuses and fact sheets
 */
export const FUND_EXPENSE_RATIOS = {
  // Vanguard
  'VTI': 0.03,   // Vanguard Total Stock Market ETF
  'VOO': 0.03,   // Vanguard S&P 500 ETF
  'VXUS': 0.07,  // Vanguard Total International Stock ETF
  'VAN 500': 0.04, // Vanguard 500 Index Fund Admiral (approximate)
  'VANGUARD 500': 0.04,
  '0899': 0.04,  // Voya's Vanguard 500 fund

  // Invesco
  'QQQM': 0.15,  // Invesco NASDAQ 100 ETF
  'QQQ': 0.20,   // Invesco QQQ Trust

  // Default for unknown funds
  'DEFAULT': 0.10,
};

/**
 * Calculates the weighted-average expense ratio for the portfolio.
 * @param {Array} holdings - Array of holdings with fund, shares, and marketValue
 * @returns {Object} Expense ratio metrics
 */
export function calculateWeightedExpenseRatio(holdings) {
  if (!holdings || holdings.length === 0) {
    return {
      weightedAverage: 0,
      annualCost: 0,
      breakdown: [],
    };
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  let weightedSum = 0;
  const breakdown = [];

  for (const holding of holdings) {
    const fundName = holding.fund.toUpperCase();
    let expenseRatio = FUND_EXPENSE_RATIOS['DEFAULT'];

    // Match fund name to known expense ratios
    for (const [key, ratio] of Object.entries(FUND_EXPENSE_RATIOS)) {
      if (fundName.includes(key)) {
        expenseRatio = ratio;
        break;
      }
    }

    const weight = holding.marketValue / totalValue;
    const contribution = expenseRatio * weight;
    weightedSum += contribution;

    breakdown.push({
      fund: holding.fund,
      expenseRatio: expenseRatio,
      weight: weight * 100, // Convert to percentage
      contribution: contribution * 100, // Convert to basis points
      annualCost: holding.marketValue * (expenseRatio / 100),
    });
  }

  return {
    weightedAverage: weightedSum,
    annualCost: totalValue * (weightedSum / 100),
    breakdown: breakdown.sort((a, b) => b.weight - a.weight),
    totalValue,
  };
}

/**
 * Calculates portfolio dividend yield and projected annual income.
 * @param {Array} holdings - Array of holdings with fund and marketValue
 * @param {Array} dividends - Array of dividend payments
 * @returns {Object} Dividend metrics
 */
export function calculateDividendMetrics(holdings, dividends) {
  if (!holdings || holdings.length === 0 || !dividends || dividends.length === 0) {
    return {
      portfolioYield: 0,
      projectedAnnual: 0,
      ttm: 0,
      ytd: 0,
      byFund: [],
    };
  }

  // Calculate trailing 12 months (TTM) and YTD
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  let ttmTotal = 0;
  let ytdTotal = 0;
  const fundDividends = new Map();

  for (const div of dividends) {
    const divDate = new Date(div.date);
    const amount = parseFloat(div.amount) || 0;
    const fund = div.fund || 'Unknown';

    // TTM calculation
    if (divDate >= oneYearAgo) {
      ttmTotal += amount;
    }

    // YTD calculation
    if (divDate >= ytdStart) {
      ytdTotal += amount;
    }

    // Aggregate by fund
    if (!fundDividends.has(fund)) {
      fundDividends.set(fund, { ttm: 0, ytd: 0 });
    }
    const fundData = fundDividends.get(fund);
    if (divDate >= oneYearAgo) fundData.ttm += amount;
    if (divDate >= ytdStart) fundData.ytd += amount;
  }

  // Calculate portfolio-wide metrics
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const portfolioYield = totalValue > 0 ? (ttmTotal / totalValue) * 100 : 0;

  // Calculate per-fund dividend yield
  const byFund = holdings.map(holding => {
    const fundData = fundDividends.get(holding.fund) || { ttm: 0, ytd: 0 };
    const yield_ = holding.marketValue > 0 ? (fundData.ttm / holding.marketValue) * 100 : 0;

    return {
      fund: holding.fund,
      marketValue: holding.marketValue,
      ttmDividends: fundData.ttm,
      ytdDividends: fundData.ytd,
      yield: yield_,
      projectedAnnual: fundData.ttm, // Use TTM as projection
    };
  }).sort((a, b) => b.ttmDividends - a.ttmDividends);

  return {
    portfolioYield,
    projectedAnnual: ttmTotal, // Project based on TTM
    ttm: ttmTotal,
    ytd: ytdTotal,
    byFund,
    totalValue,
  };
}

/**
 * NOTE: Benchmark comparison functions removed.
 * These will be re-implemented once we have a proper historical prices API.
 * Potential implementation: Create /api/prices/historical endpoint using Finnhub
 * to fetch real VOO historical data as S&P 500 proxy.
 */
