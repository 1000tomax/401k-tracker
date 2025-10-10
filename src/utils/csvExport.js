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
 * Converts portfolio holdings data to CSV format.
 *
 * @param {Array<object>} holdingsByAccount Array of account objects with holdings
 * @returns {string} CSV-formatted string with headers and data rows
 */
export function convertHoldingsToCSV(holdingsByAccount) {
  const headers = [
    'Account',
    'Fund',
    'Shares',
    'Avg Cost',
    'Cost Basis',
    'Latest Price',
    'Market Value',
    'Gain/Loss',
    'Gain/Loss %'
  ];

  // Handle empty or invalid input
  if (!Array.isArray(holdingsByAccount) || holdingsByAccount.length === 0) {
    return headers.join(',');
  }

  const rows = [headers.join(',')];

  holdingsByAccount.forEach(account => {
    // Validate account has holdings array
    if (!account || !Array.isArray(account.holdings)) {
      return;
    }

    account.holdings.forEach(holding => {
      const gainLossPercent = holding.costBasis > 0
        ? ((holding.gainLoss / holding.costBasis) * 100).toFixed(2)
        : '0.00';

      rows.push([
        escapeCSVValue(account.accountName || 'Unknown'),
        escapeCSVValue(holding.fund || 'Unknown'),
        formatNumber(holding.shares, 4),
        formatNumber(holding.avgCost, 2),
        formatNumber(holding.costBasis, 2),
        formatNumber(holding.latestNAV, 2),
        formatNumber(holding.marketValue, 2),
        formatNumber(holding.gainLoss, 2),
        gainLossPercent
      ].join(','));
    });
  });

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
