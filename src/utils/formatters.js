/**
 * @fileoverview This file contains utility functions for formatting data for display,
 * such as currencies, percentages, dates, and names.
 */

/**
 * Formats a number as a USD currency string.
 * @param {number} value The number to format.
 * @returns {string} The formatted currency string (e.g., "$1,234.56").
 */
export function formatCurrency(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a number as a string representing shares, with high precision.
 * @param {number} value The number of shares to format.
 * @returns {string} The formatted shares string (e.g., "123.456789").
 */
export function formatShares(value) {
  if (!Number.isFinite(value)) return '0.000';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  }).format(value);
}

/**
 * Formats a number as a USD currency string, suitable for unit prices which may require higher precision.
 * @param {number} value The unit price to format.
 * @returns {string} The formatted unit price string.
 */
export function formatUnitPrice(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

/**
 * Formats a number as a percentage string.
 * @param {number} value The number to format (e.g., 0.123 for 12.3%).
 * @returns {string} The formatted percentage string (e.g., "12.30%").
 */
export function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Formats a date string into a human-readable format (e.g., "Oct 7, 2025").
 * It correctly handles date strings in 'YYYY-MM-DD' format, parsing them as local dates
 * to prevent timezone-related shifts.
 * @param {string} value The date string to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(value) {
  if (!value) return '—';

  // Parse date string - treat dates as local, not UTC
  let date;
  if (value.includes('T')) {
    // Already has time component (ISO format)
    date = new Date(value);
  } else {
    // Date only (YYYY-MM-DD) - parse as local date to avoid timezone shifts
    // Use Date constructor with year, month, day to avoid UTC conversion
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day); // month is 0-indexed
  }

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

/**
 * A map of full fund names to shorter, more readable display names.
 * @type {Object<string, string>}
 */
const FUND_NAME_OVERRIDES = {
  '0899 Vanguard 500 Index Fund Adm': 'Vanguard 500',
};

/**
 * A map of money source names to shorter, more readable display names.
 * @type {Object<string, string>}
 */
const SOURCE_NAME_OVERRIDES = {
  'Safe Harbor Match': 'Match',
  'Employee PreTax': 'Traditional',
  'Employee Post Tax': 'Roth',
  'She Roth on that thing til i IRA': 'Roth IRA',
};

/**
 * Formats a fund name using the `FUND_NAME_OVERRIDES` map.
 * If no override is found, it returns the original name.
 * @param {string} name The original fund name.
 * @returns {string} The formatted fund name.
 */
export function formatFundName(name) {
  if (!name) return 'Unknown';
  return FUND_NAME_OVERRIDES[name] || name;
}

/**
 * Formats a money source name using the `SOURCE_NAME_OVERRIDES` map.
 * If no override is found, it returns the original name.
 * @param {string} name The original source name.
 * @returns {string} The formatted source name.
 */
export function formatSourceName(name) {
  if (!name) return 'Unknown';
  return SOURCE_NAME_OVERRIDES[name] || name;
}
