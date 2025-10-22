/**
 * @fileoverview CSV export utilities for portfolio data.
 * Provides functions to convert holdings data to CSV format and trigger browser downloads.
 */

/**
 * Escapes a value for safe CSV output.
 * Handles double quotes by doubling them and wraps values containing special characters.
 *
 * @param {string|number} value The value to escape
 * @returns {string} CSV-safe escaped value
 */
function escapeCSVValue(value) {
  const stringValue = String(value);
  // If value contains comma, quote, or newline, escape it
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Safely formats a number with fixed decimal places.
 * Returns '0.00' for null, undefined, or non-numeric values.
 *
 * @param {number} value The number to format
 * @param {number} decimals Number of decimal places
 * @returns {string} Formatted number string
 */
function formatNumber(value, decimals) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : '0.00';
}

/**
 * Calculates the number of days between a date string and today.
 *
 * @param {string} dateString Date in YYYY-MM-DD format
 * @returns {number|null} Number of days held, or null if date is invalid
 */
function calculateDaysHeld(dateString) {
  if (!dateString) return null;

  try {
    const purchaseDate = new Date(dateString);
    const today = new Date();
    const diffTime = today - purchaseDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}

/**
 * Converts portfolio holdings data to CSV format.
 *
 * @param {Array<object>} holdingsByAccount Array of account objects with holdings
 * @param {number} totalPortfolioValue Total portfolio market value for allocation calculation
 * @returns {string} CSV-formatted string with headers and data rows
 */
export function convertHoldingsToCSV(holdingsByAccount, totalPortfolioValue = null) {
  const headers = [
    'Account',
    'Fund',
    'Source',
    'Shares',
    'Avg Cost',
    'Cost Basis',
    'Latest Price',
    'Market Value',
    'Gain/Loss',
    'Gain/Loss %',
    'Allocation %',
    'First Purchase',
    'Days Held'
  ];

  // Handle empty or invalid input
  if (!Array.isArray(holdingsByAccount) || holdingsByAccount.length === 0) {
    return headers.join(',');
  }

  const rows = [headers.join(',')];

  // Calculate total portfolio value if not provided
  if (totalPortfolioValue === null) {
    totalPortfolioValue = holdingsByAccount.reduce((sum, account) => {
      return sum + (account.totalValue || 0);
    }, 0);
  }

  // Helper function to extract source from account name
  const extractSource = (accountName) => {
    if (!accountName) return '';

    // Extract source from patterns like "Voya 401(k) (Match)" or "Voya 401(k) (PreTax)"
    const sourceMatch = accountName.match(/\(([^)]+)\)$/);
    if (sourceMatch) {
      return sourceMatch[1];
    }

    return '';
  };

  // Track totals for summary rows
  const accountTotals = new Map();
  const sourceTotals = new Map();
  let overallCostBasis = 0;
  let overallMarketValue = 0;
  let overallGainLoss = 0;

  holdingsByAccount.forEach(account => {
    // Validate account has holdings array
    if (!account || !Array.isArray(account.holdings)) {
      return;
    }

    // If this account has source breakdown (like Voya 401k), export each source separately
    if (account.sources && Array.isArray(account.sources)) {
      account.sources.forEach(sourceData => {
        sourceData.holdings.forEach(holding => {
          const gainLossPercent = holding.costBasis > 0
            ? ((holding.gainLoss / holding.costBasis) * 100).toFixed(2)
            : '0.00';

          const allocationPercent = totalPortfolioValue > 0
            ? ((holding.marketValue / totalPortfolioValue) * 100).toFixed(2)
            : '0.00';

          const daysHeld = calculateDaysHeld(holding.firstBuyDate);

          // Accumulate totals
          const accountKey = account.accountName || 'Unknown';
          const sourceKey = sourceData.source || 'Unknown';

          if (!accountTotals.has(accountKey)) {
            accountTotals.set(accountKey, { costBasis: 0, marketValue: 0, gainLoss: 0 });
          }
          if (!sourceTotals.has(sourceKey)) {
            sourceTotals.set(sourceKey, { costBasis: 0, marketValue: 0, gainLoss: 0 });
          }

          accountTotals.get(accountKey).costBasis += holding.costBasis || 0;
          accountTotals.get(accountKey).marketValue += holding.marketValue || 0;
          accountTotals.get(accountKey).gainLoss += holding.gainLoss || 0;

          sourceTotals.get(sourceKey).costBasis += holding.costBasis || 0;
          sourceTotals.get(sourceKey).marketValue += holding.marketValue || 0;
          sourceTotals.get(sourceKey).gainLoss += holding.gainLoss || 0;

          overallCostBasis += holding.costBasis || 0;
          overallMarketValue += holding.marketValue || 0;
          overallGainLoss += holding.gainLoss || 0;

          rows.push([
            escapeCSVValue(account.accountName || 'Unknown'),
            escapeCSVValue(holding.fund || 'Unknown'),
            escapeCSVValue(sourceData.source || ''),
            formatNumber(holding.shares, 4),
            formatNumber(holding.avgCost, 2),
            formatNumber(holding.costBasis, 2),
            formatNumber(holding.latestNAV, 2),
            formatNumber(holding.marketValue, 2),
            formatNumber(holding.gainLoss, 2),
            gainLossPercent,
            allocationPercent,
            holding.firstBuyDate || '',
            daysHeld !== null ? daysHeld.toString() : ''
          ].join(','));
        });
      });
    } else {
      // Regular account - extract source from account name if available
      account.holdings.forEach(holding => {
        const gainLossPercent = holding.costBasis > 0
          ? ((holding.gainLoss / holding.costBasis) * 100).toFixed(2)
          : '0.00';

        const allocationPercent = totalPortfolioValue > 0
          ? ((holding.marketValue / totalPortfolioValue) * 100).toFixed(2)
          : '0.00';

        const source = extractSource(account.accountName);
        const daysHeld = calculateDaysHeld(holding.firstBuyDate);

        // Accumulate totals
        const accountKey = account.accountName || 'Unknown';
        const sourceKey = source || 'Unknown';

        if (!accountTotals.has(accountKey)) {
          accountTotals.set(accountKey, { costBasis: 0, marketValue: 0, gainLoss: 0 });
        }
        if (!sourceTotals.has(sourceKey)) {
          sourceTotals.set(sourceKey, { costBasis: 0, marketValue: 0, gainLoss: 0 });
        }

        accountTotals.get(accountKey).costBasis += holding.costBasis || 0;
        accountTotals.get(accountKey).marketValue += holding.marketValue || 0;
        accountTotals.get(accountKey).gainLoss += holding.gainLoss || 0;

        sourceTotals.get(sourceKey).costBasis += holding.costBasis || 0;
        sourceTotals.get(sourceKey).marketValue += holding.marketValue || 0;
        sourceTotals.get(sourceKey).gainLoss += holding.gainLoss || 0;

        overallCostBasis += holding.costBasis || 0;
        overallMarketValue += holding.marketValue || 0;
        overallGainLoss += holding.gainLoss || 0;

        rows.push([
          escapeCSVValue(account.accountName || 'Unknown'),
          escapeCSVValue(holding.fund || 'Unknown'),
          escapeCSVValue(source),
          formatNumber(holding.shares, 4),
          formatNumber(holding.avgCost, 2),
          formatNumber(holding.costBasis, 2),
          formatNumber(holding.latestNAV, 2),
          formatNumber(holding.marketValue, 2),
          formatNumber(holding.gainLoss, 2),
          gainLossPercent,
          allocationPercent,
          holding.firstBuyDate || '',
          daysHeld !== null ? daysHeld.toString() : ''
        ].join(','));
      });
    }
  });

  // Add summary rows
  rows.push(''); // Blank line separator

  // Summary section header
  rows.push('SUMMARY');
  rows.push('');

  // Total by Account
  rows.push('By Account');
  for (const [accountName, totals] of accountTotals.entries()) {
    const gainLossPercent = totals.costBasis > 0
      ? ((totals.gainLoss / totals.costBasis) * 100).toFixed(2)
      : '0.00';
    const allocationPercent = totalPortfolioValue > 0
      ? ((totals.marketValue / totalPortfolioValue) * 100).toFixed(2)
      : '0.00';

    rows.push([
      escapeCSVValue(accountName),
      '',
      '',
      '',
      '',
      formatNumber(totals.costBasis, 2),
      '',
      formatNumber(totals.marketValue, 2),
      formatNumber(totals.gainLoss, 2),
      gainLossPercent,
      allocationPercent,
      '',
      ''
    ].join(','));
  }
  rows.push('');

  // Total by Source Type
  rows.push('By Source Type');
  for (const [sourceName, totals] of sourceTotals.entries()) {
    if (sourceName === 'Unknown') continue; // Skip unknown sources in summary

    const gainLossPercent = totals.costBasis > 0
      ? ((totals.gainLoss / totals.costBasis) * 100).toFixed(2)
      : '0.00';
    const allocationPercent = totalPortfolioValue > 0
      ? ((totals.marketValue / totalPortfolioValue) * 100).toFixed(2)
      : '0.00';

    rows.push([
      '',
      '',
      escapeCSVValue(sourceName),
      '',
      '',
      formatNumber(totals.costBasis, 2),
      '',
      formatNumber(totals.marketValue, 2),
      formatNumber(totals.gainLoss, 2),
      gainLossPercent,
      allocationPercent,
      '',
      ''
    ].join(','));
  }
  rows.push('');

  // Overall Portfolio Total
  rows.push('Overall Portfolio Total');
  const overallGainLossPercent = overallCostBasis > 0
    ? ((overallGainLoss / overallCostBasis) * 100).toFixed(2)
    : '0.00';

  rows.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    formatNumber(overallCostBasis, 2),
    '',
    formatNumber(overallMarketValue, 2),
    formatNumber(overallGainLoss, 2),
    overallGainLossPercent,
    '100.00',
    '',
    ''
  ].join(','));

  return rows.join('\n');
}

/**
 * Triggers a browser download of CSV content.
 *
 * @param {string} csvContent The CSV data as a string
 * @param {string} filename The desired filename for the download
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    // Always clean up the object URL, even if download fails
    URL.revokeObjectURL(url);
  }
}
