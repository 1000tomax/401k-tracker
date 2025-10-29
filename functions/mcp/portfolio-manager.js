/**
 * Voya Transaction Importer - MCP Server (Cloudflare Worker)
 *
 * Provides MCP tools for importing Voya 401k transactions via Claude Code/Chat
 *
 * Tools:
 * - parse_voya_transactions: Parse and preview transactions without saving
 * - import_voya_transactions: Parse and save transactions to Supabase
 * - get_portfolio_summary: Get current portfolio totals
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// PARSING UTILITIES (from parseTransactions.js)
// ============================================================================

/**
 * Converts a string-like value into a number
 */
function toNumber(numLike) {
  if (numLike == null) return 0;
  const str = String(numLike).trim();
  if (!str) return 0;

  const isParensNegative = /^\(.*\)$/.test(str);
  const sanitized = str.replace(/[$,]/g, '').replace(/[()]/g, '').trim();
  const trailingNegative = sanitized.endsWith('-');
  const normalized = trailingNegative ? `-${sanitized.slice(0, -1)}` : sanitized;
  const value = Number.parseFloat(normalized);

  if (!Number.isFinite(value)) return 0;
  return isParensNegative ? -value : value;
}

/**
 * Normalizes a date string to YYYY-MM-DD format
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  // Already in ISO format
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    return str;
  }

  // MM/DD/YYYY or M/D/YYYY
  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    let [, month, day, year] = match;
    if (year.length === 2) {
      year = year >= '50' ? `19${year}` : `20${year}`;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Smart split function that handles tabs and multiple spaces
 */
function smartSplit(line) {
  if (!line) return [];
  return line.split(/\t+/).map(part => part.trim()).filter(Boolean);
}

/**
 * Parse a CSV line respecting quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Detect if text is CSV format
 */
function isCSVFormat(text) {
  if (!text) return false;

  // Check for quoted comma-separated values pattern
  const hasQuotedCommas = text.includes('","') || /^".*",".*",".*"/m.test(text);

  // Check for CSV header pattern
  const hasCSVHeader = /Activity Date.*,.*Activity.*,.*Fund.*,.*Money Source/i.test(text);

  return hasQuotedCommas || hasCSVHeader;
}

/**
 * Parse Voya CSV format (exported from Voya website)
 */
function parseVoyaCSV(rawText) {
  if (!rawText) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  // Skip header line and any company info lines
  const dataLines = lines.filter((line, index) => {
    // Skip first line if it looks like company info
    if (index === 0 && !line.startsWith('"')) return false;

    // Skip CSV header row
    if (/Activity Date.*,.*Activity.*,.*Fund/i.test(line)) return false;

    // Must start with quote (data rows)
    return line.startsWith('"');
  });

  const transactions = [];

  for (const line of dataLines) {
    const parts = parseCSVLine(line);

    // CSV format: Date, Activity, Fund, Money Source, Units, Unit Price, Amount, [extra columns...]
    // We only need first 7 columns
    if (parts.length < 7) continue;

    const [rawDate, activity, fund, moneySource, unitsStr, priceStr, amountStr] = parts;

    const date = normalizeDate(rawDate);
    if (!date) continue;

    const units = toNumber(unitsStr);
    const unitPrice = toNumber(priceStr);
    const amount = toNumber(amountStr);

    transactions.push({
      date,
      activity: activity.trim(),
      fund: fund.trim(),
      moneySource: moneySource.trim(),
      units,
      unitPrice,
      amount,
      sourceType: 'voya',
      sourceId: 'voya_401k',
    });
  }

  return transactions;
}

/**
 * Parse Voya plain text format (copy-pasted from website table)
 */
function parseVoyaPlainText(rawText) {
  if (!rawText) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  // Filter out header rows
  const dataLines = lines.filter((line, index) => {
    if (index === 0 && /date/i.test(line) && /activity/i.test(line)) {
      return false;
    }
    return true;
  });

  const rows = dataLines
    .map(smartSplit)
    .filter(parts => parts.length >= 7); // Date, Activity, Fund, Source, Units, Price, Amount

  const transactions = [];

  for (const parts of rows) {
    if (parts.length < 7) continue;

    const [rawDate, activity, fund, moneySource, unitsStr, priceStr, amountStr] = parts;

    const date = normalizeDate(rawDate);
    if (!date) continue;

    const units = toNumber(unitsStr);
    const unitPrice = toNumber(priceStr);
    const amount = toNumber(amountStr);

    transactions.push({
      date,
      activity: activity.trim(),
      fund: fund.trim(),
      moneySource: moneySource.trim(),
      units,
      unitPrice,
      amount,
      sourceType: 'voya',
      sourceId: 'voya_401k',
    });
  }

  return transactions;
}

/**
 * Parse Voya transaction text (auto-detects CSV or plain text format)
 */
function parseVoyaTransactions(rawText) {
  if (!rawText) return [];

  // Auto-detect format and parse accordingly
  if (isCSVFormat(rawText)) {
    return parseVoyaCSV(rawText);
  } else {
    return parseVoyaPlainText(rawText);
  }
}

/**
 * Generate summary statistics from parsed transactions
 */
function generateSummary(transactions) {
  if (!transactions || transactions.length === 0) {
    return null;
  }

  const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalShares = transactions.reduce((sum, tx) => sum + (tx.units || 0), 0);

  // Group by money source
  const bySource = {};
  transactions.forEach(tx => {
    const source = tx.moneySource || 'Unknown';
    if (!bySource[source]) {
      bySource[source] = {
        count: 0,
        amount: 0,
        shares: 0,
      };
    }
    bySource[source].count++;
    bySource[source].amount += tx.amount || 0;
    bySource[source].shares += tx.units || 0;
  });

  // Date range
  const dates = transactions.map(tx => tx.date).sort();
  const dateRange = {
    earliest: dates[0],
    latest: dates[dates.length - 1],
  };

  return {
    totalTransactions: transactions.length,
    totalAmount,
    totalShares,
    bySource,
    dateRange,
  };
}

/**
 * A simple, non-cryptographic hashing function for generating short hashes from strings.
 * @param {string} str - The input string.
 * @returns {string} A short hexadecimal hash string.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

/**
 * Create transaction hash for duplicate detection
 * Must match the format used by the web API for consistency
 */
function createTransactionHash(tx) {
  const primaryData = `${tx.date}|${tx.amount}|${tx.fund?.toLowerCase() || ''}|${tx.activity?.toLowerCase() || ''}`;
  return simpleHash(primaryData);
}

/**
 * Format holdings as readable text
 */
function formatHoldingsAsText(holdings, totals, asOfDate) {
  let text = `Portfolio Holdings as of ${asOfDate}\n`;
  text += `${'='.repeat(80)}\n\n`;

  holdings.forEach(h => {
    text += `${h.fund}\n`;
    text += `  Account: ${h.account}\n`;
    text += `  Shares: ${h.shares.toFixed(4)}\n`;
    text += `  Unit Price: $${h.unit_price.toFixed(2)}\n`;
    text += `  Market Value: $${h.market_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    if (h.cost_basis !== undefined) {
      text += `  Cost Basis: $${h.cost_basis.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      text += `  Gain/Loss: $${h.gain_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${h.gain_loss_percent}%)\n`;
    }
    text += `  % of Portfolio: ${h.percent_of_portfolio}%\n\n`;
  });

  text += `${'='.repeat(80)}\n`;
  text += `Total Positions: ${totals.total_positions}\n`;
  text += `Total Market Value: $${totals.total_market_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  if (totals.total_cost_basis !== undefined) {
    text += `Total Cost Basis: $${totals.total_cost_basis.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    text += `Total Gain/Loss: $${totals.total_gain_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  }

  return text;
}

/**
 * Format dividend history as readable text
 */
function formatDividendsAsText(grouped, totalAmount, startDate, endDate, groupBy, yieldData) {
  let text = `Dividend History: ${startDate} to ${endDate}\n`;
  text += `Grouped by: ${groupBy}\n`;
  text += `${'='.repeat(80)}\n\n`;

  grouped.forEach(g => {
    text += `${g.group}\n`;
    text += `  Payments: ${g.count}\n`;
    text += `  Total: $${g.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;

    if (yieldData && yieldData[g.group]) {
      text += `  Yield: ${yieldData[g.group].yield_percent}%\n`;
    }

    text += `  Details:\n`;
    g.dividends.slice(0, 5).forEach(d => {
      text += `    ${d.date}: $${d.amount.toFixed(2)} - ${d.fund}\n`;
    });
    if (g.dividends.length > 5) {
      text += `    ... and ${g.dividends.length - 5} more\n`;
    }
    text += `\n`;
  });

  text += `${'='.repeat(80)}\n`;
  text += `Grand Total: $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  text += `Total Payments: ${grouped.reduce((sum, g) => sum + g.count, 0)}\n`;

  return text;
}

/**
 * Format transaction search results as readable text
 */
function formatTransactionsAsText(transactions, summary, filters) {
  let text = `Transaction Search Results\n`;
  if (filters.startDate || filters.endDate) {
    text += `Date Range: ${filters.startDate || 'any'} to ${filters.endDate || 'any'}\n`;
  }
  if (filters.fund) text += `Fund Filter: ${filters.fund}\n`;
  if (filters.activity) text += `Activity Filter: ${filters.activity}\n`;
  if (filters.moneySource) text += `Money Source Filter: ${filters.moneySource}\n`;
  text += `${'='.repeat(80)}\n\n`;

  transactions.slice(0, 20).forEach(t => {
    text += `${t.date} | ${t.activity}\n`;
    text += `  Fund: ${t.fund}\n`;
    if (t.money_source) text += `  Source: ${t.money_source}\n`;
    if (t.shares) text += `  Shares: ${t.shares.toFixed(4)} @ $${t.unit_price.toFixed(2)}\n`;
    text += `  Amount: $${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
  });

  if (transactions.length > 20) {
    text += `... and ${transactions.length - 20} more transactions\n\n`;
  }

  text += `${'='.repeat(80)}\n`;
  text += `Summary:\n`;
  text += `  Total Transactions: ${summary.count}\n`;
  text += `  Total Amount: $${summary.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  text += `  Date Range: ${summary.date_range.earliest} to ${summary.date_range.latest}\n`;
  text += `\nBy Activity:\n`;
  Object.entries(summary.by_activity).forEach(([activity, stats]) => {
    text += `  ${activity}: ${stats.count} transactions, $${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  });

  return text;
}

/**
 * Format performance history as readable text
 */
function formatPerformanceHistoryAsText(metrics, timeline, includeContributions) {
  let text = `Portfolio Performance History\n`;
  text += `${metrics.start_date} to ${metrics.end_date} (${metrics.interval} data)\n`;
  text += `${'='.repeat(80)}\n\n`;

  text += `Overall Performance:\n`;
  text += `  Starting Value: $${metrics.starting_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  text += `  Ending Value: $${metrics.ending_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  text += `  Total Change: $${metrics.total_change.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${metrics.total_change_percent}%)\n`;

  if (includeContributions && metrics.contributions_added !== undefined) {
    text += `\n  Money In (Contributions): $${metrics.contributions_added.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    text += `  Market Gain: $${metrics.market_gain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${metrics.market_gain_percent}%)\n`;
  }

  if (metrics.cagr) {
    text += `\n  CAGR (Annualized): ${metrics.cagr}%\n`;
  }

  if (metrics.best_period) {
    text += `\n  Best Period: ${metrics.best_period.date}\n`;
    text += `    Change: $${metrics.best_period.change.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${metrics.best_period.changePercent}%)\n`;
  }

  if (metrics.worst_period) {
    text += `\n  Worst Period: ${metrics.worst_period.date}\n`;
    text += `    Change: $${metrics.worst_period.change.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${metrics.worst_period.changePercent}%)\n`;
  }

  text += `\n${'='.repeat(80)}\n`;
  text += `Data Points: ${metrics.data_points}\n`;

  // Show recent timeline (last 10 data points)
  if (timeline.length > 0) {
    text += `\nRecent Timeline (last ${Math.min(10, timeline.length)} points):\n`;
    const recentTimeline = timeline.slice(-10);
    recentTimeline.forEach(t => {
      text += `  ${t.date}: $${t.market_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      if (includeContributions && t.cumulative_contributions !== undefined) {
        text += ` (contributions: $${t.cumulative_contributions.toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
      }
      text += `\n`;
    });
  }

  return text;
}

/**
 * Format fund performance as readable text
 */
function formatFundPerformanceAsText(fundPerformance, compareFunds) {
  let text = `Fund Performance Analysis\n`;
  text += `${'='.repeat(80)}\n\n`;

  fundPerformance.forEach((fund, index) => {
    text += `${index + 1}. ${fund.fund_name} (${fund.ticker})\n`;
    text += `   Period: ${fund.start_date} to ${fund.end_date}\n`;
    text += `   Starting Value: $${fund.start_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    text += `   Ending Value: $${fund.end_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    text += `   Total Return: $${fund.total_return.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${fund.total_return_percent}%)\n`;

    if (fund.cagr) {
      text += `   CAGR: ${fund.cagr}%\n`;
    }

    text += `\n   Shares: ${fund.start_shares.toFixed(4)} → ${fund.end_shares.toFixed(4)} (${fund.share_change >= 0 ? '+' : ''}${fund.share_change.toFixed(4)})\n`;
    text += `   Price: $${fund.start_price.toFixed(2)} → $${fund.end_price.toFixed(2)} (${fund.price_change >= 0 ? '+' : ''}${fund.price_change.toFixed(2)}, ${fund.price_change_percent}%)\n`;
    text += `   Data Points: ${fund.data_points}\n\n`;
  });

  text += `${'='.repeat(80)}\n`;
  text += `Total Funds Analyzed: ${fundPerformance.length}\n`;

  if (compareFunds && fundPerformance.length > 1) {
    text += `\nPerformance Ranking (by total return %):\n`;
    fundPerformance.forEach((fund, index) => {
      text += `  ${index + 1}. ${fund.ticker}: ${fund.total_return_percent}%\n`;
    });
  }

  return text;
}

/**
 * Format current prices as readable text
 */
function formatCurrentPricesAsText(prices) {
  let text = `Current Market Prices\n`;
  text += `${'='.repeat(80)}\n\n`;

  prices.forEach(p => {
    text += `${p.ticker}\n`;
    text += `  Price: $${p.price.toFixed(2)}\n`;
    if (p.change_percent !== null) {
      const sign = p.change_percent >= 0 ? '+' : '';
      text += `  Change: ${sign}${p.change_percent.toFixed(2)}%\n`;
    }
    text += `  Updated: ${p.updated_at}\n\n`;
  });

  text += `${'='.repeat(80)}\n`;
  text += `Total Prices: ${prices.length}\n`;

  return text;
}

// ============================================================================
// MCP PROTOCOL HANDLER
// ============================================================================

/**
 * Handle MCP tool list request
 */
function handleToolsList() {
  return {
    tools: [
      {
        name: 'parse_voya_transactions',
        description: 'Parse Voya transaction data and preview without saving',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Raw text copied from Voya transaction history'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'import_voya_transactions',
        description: 'Parse and import Voya transactions to Supabase database',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Raw text copied from Voya transaction history'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'get_portfolio_summary',
        description: 'Get current portfolio summary with total value and holdings',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_holdings',
        description: 'Get detailed holdings breakdown by fund and account. Shows shares, values, cost basis, and gains. Supports historical queries.',
        inputSchema: {
          type: 'object',
          properties: {
            as_of_date: {
              type: 'string',
              description: 'Date to query holdings (YYYY-MM-DD format). Defaults to today.'
            },
            include_zero_balance: {
              type: 'boolean',
              description: 'Include funds with zero shares (sold positions). Defaults to false.'
            },
            calculate_gains: {
              type: 'boolean',
              description: 'Include gain/loss calculations. Defaults to true.'
            }
          },
          required: []
        }
      },
      {
        name: 'get_dividend_history',
        description: 'Get dividend payment history with flexible grouping options. Shows income by fund, month, or quarter. Optionally calculates dividend yield.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date for dividend history (YYYY-MM-DD format). Defaults to beginning of current year.'
            },
            end_date: {
              type: 'string',
              description: 'End date for dividend history (YYYY-MM-DD format). Defaults to today.'
            },
            group_by: {
              type: 'string',
              enum: ['fund', 'month', 'quarter'],
              description: 'How to group dividend results. Defaults to "fund".'
            },
            calculate_yield: {
              type: 'boolean',
              description: 'Calculate dividend yield based on current holdings. Defaults to false.'
            }
          },
          required: []
        }
      },
      {
        name: 'search_transactions',
        description: 'Search and filter transactions with flexible criteria. Filter by date range, fund, activity type, and money source. Useful for auditing contributions, fees, and specific transaction types.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date for search (YYYY-MM-DD format).'
            },
            end_date: {
              type: 'string',
              description: 'End date for search (YYYY-MM-DD format).'
            },
            fund: {
              type: 'string',
              description: 'Filter by fund name (partial match, case-insensitive).'
            },
            activity: {
              type: 'string',
              description: 'Filter by activity type (e.g., "Contribution", "Dividend", "Fee").'
            },
            money_source: {
              type: 'string',
              description: 'Filter by money source (e.g., "ROTH", "Safe Harbor Match", "Employee PreTax").'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return. Defaults to 50, max 500.'
            },
            sort: {
              type: 'string',
              enum: ['date_desc', 'date_asc', 'amount_desc'],
              description: 'How to sort results. Defaults to "date_desc".'
            }
          },
          required: []
        }
      },
      {
        name: 'get_performance_history',
        description: 'Track portfolio value and performance over time. Shows growth trends, returns by period, and contribution vs market gain analysis. Supports different time intervals.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date for performance history (YYYY-MM-DD format). Defaults to 1 year ago.'
            },
            end_date: {
              type: 'string',
              description: 'End date for performance history (YYYY-MM-DD format). Defaults to today.'
            },
            interval: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly'],
              description: 'Data point interval. Defaults to "daily".'
            },
            include_contributions: {
              type: 'boolean',
              description: 'Include contribution tracking to separate money in vs growth. Defaults to true.'
            },
            calculate_returns: {
              type: 'boolean',
              description: 'Calculate percentage returns and growth rates. Defaults to true.'
            }
          },
          required: []
        }
      },
      {
        name: 'get_fund_performance',
        description: 'Analyze individual fund performance over time. Compare multiple funds, track growth rates, and see fund-specific returns. Uses fund snapshots for detailed fund-level analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date for fund performance (YYYY-MM-DD format). Defaults to 1 year ago.'
            },
            end_date: {
              type: 'string',
              description: 'End date for fund performance (YYYY-MM-DD format). Defaults to today.'
            },
            ticker: {
              type: 'string',
              description: 'Filter by specific fund ticker (e.g., "VOYA_0899", "VTI"). Optional - omit to see all funds.'
            },
            compare_funds: {
              type: 'boolean',
              description: 'Compare performance of multiple funds side-by-side. Defaults to false.'
            },
            calculate_cagr: {
              type: 'boolean',
              description: 'Calculate Compound Annual Growth Rate (CAGR) for each fund. Defaults to true.'
            }
          },
          required: []
        }
      },
      {
        name: 'get_current_prices',
        description: 'Get current market prices for ETFs and funds. Shows latest prices, daily changes, and last update time. Useful for checking live market values.',
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Filter by specific ticker (e.g., "VTI", "SCHD"). Optional - omit to see all tracked prices.'
            }
          },
          required: []
        }
      }
    ]
  };
}

/**
 * Handle parse_voya_transactions tool call
 */
async function handleParseTransactions(args) {
  const { text } = args;

  if (!text || !text.trim()) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'No transaction data provided' }, null, 2)
      }],
      isError: true
    };
  }

  try {
    const transactions = parseVoyaTransactions(text);

    if (transactions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No valid transactions found',
            message: 'Please make sure you copied all columns from Voya: Date, Activity, Fund, Money Source, Units, Price, Amount'
          }, null, 2)
        }],
        isError: true
      };
    }

    const summary = generateSummary(transactions);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          transactions,
          summary
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to parse transactions',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle import_voya_transactions tool call
 */
async function handleImportTransactions(args, env) {
  const { text } = args;

  if (!text || !text.trim()) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'No transaction data provided' }, null, 2)
      }],
      isError: true
    };
  }

  try {
    // Parse transactions
    const transactions = parseVoyaTransactions(text);

    if (transactions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No valid transactions found'
          }, null, 2)
        }],
        isError: true
      };
    }

    // Connect to Supabase
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Prepare transactions for insert
    const transactionsToInsert = transactions.map(tx => ({
      date: tx.date,
      fund: tx.fund,
      money_source: tx.moneySource,
      activity: tx.activity,
      units: tx.units,
      unit_price: tx.unitPrice,
      amount: tx.amount,
      source_type: 'voya',
      source_id: 'voya_401k',
      transaction_hash: createTransactionHash(tx),
    }));

    // Check for duplicates
    const hashes = transactionsToInsert.map(t => t.transaction_hash);
    const { data: existing } = await supabase
      .from('transactions')
      .select('transaction_hash')
      .in('transaction_hash', hashes);

    const existingHashes = new Set(existing?.map(t => t.transaction_hash) || []);
    const newTransactions = transactionsToInsert.filter(
      t => !existingHashes.has(t.transaction_hash)
    );

    // Insert new transactions
    let inserted = 0;
    if (newTransactions.length > 0) {
      const { data, error } = await supabase
        .from('transactions')
        .insert(newTransactions)
        .select();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      inserted = data?.length || 0;
    }

    const duplicates = transactions.length - inserted;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          imported: inserted,
          duplicates: duplicates,
          total: transactions.length,
          summary: generateSummary(newTransactions)
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to import transactions',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_portfolio_summary tool call
 */
async function handleGetPortfolioSummary(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Get latest snapshot
    const { data: snapshots, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!snapshots || snapshots.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'No portfolio data available yet'
          }, null, 2)
        }]
      };
    }

    const latest = snapshots[0];

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          snapshot_date: latest.snapshot_date,
          total_market_value: latest.total_market_value,
          total_cost_basis: latest.total_cost_basis,
          total_gain_loss: latest.total_gain_loss,
          total_gain_loss_percent: latest.total_gain_loss_percent,
          cumulative_contributions: latest.cumulative_contributions,
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get portfolio summary',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_holdings tool call
 */
async function handleGetHoldings(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Extract and validate parameters
    const today = new Date().toISOString().split('T')[0];
    const asOfDate = args.as_of_date || today;
    const includeZeroBalance = args.include_zero_balance || false;
    const calculateGains = args.calculate_gains !== false; // default true

    // Query holdings snapshots
    let query = supabase
      .from('holdings_snapshots')
      .select('*')
      .eq('snapshot_date', asOfDate);

    const { data: holdings, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!holdings || holdings.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `No holdings data available for ${asOfDate}`,
            as_of_date: asOfDate
          }, null, 2)
        }]
      };
    }

    // Filter out zero balance if requested
    let filteredHoldings = holdings;
    if (!includeZeroBalance) {
      filteredHoldings = holdings.filter(h => parseFloat(h.shares) > 0);
    }

    // Calculate total portfolio value for percentage calculations
    const totalValue = filteredHoldings.reduce((sum, h) => sum + parseFloat(h.market_value || 0), 0);

    // Format holdings data
    const formattedHoldings = filteredHoldings.map(h => ({
      fund: h.fund,
      account: h.account_name,
      shares: parseFloat(h.shares),
      unit_price: parseFloat(h.unit_price),
      market_value: parseFloat(h.market_value),
      cost_basis: calculateGains ? parseFloat(h.cost_basis) : undefined,
      gain_loss: calculateGains ? parseFloat(h.gain_loss) : undefined,
      gain_loss_percent: calculateGains && h.cost_basis > 0 ?
        ((parseFloat(h.gain_loss) / parseFloat(h.cost_basis)) * 100).toFixed(2) : undefined,
      percent_of_portfolio: ((parseFloat(h.market_value) / totalValue) * 100).toFixed(2)
    }));

    // Sort by market value descending
    formattedHoldings.sort((a, b) => b.market_value - a.market_value);

    // Calculate totals
    const totals = {
      total_market_value: totalValue,
      total_cost_basis: calculateGains ? formattedHoldings.reduce((sum, h) => sum + (h.cost_basis || 0), 0) : undefined,
      total_gain_loss: calculateGains ? formattedHoldings.reduce((sum, h) => sum + (h.gain_loss || 0), 0) : undefined,
      total_positions: formattedHoldings.length
    };

    // Format as text for readability
    const formattedText = formatHoldingsAsText(formattedHoldings, totals, asOfDate);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          as_of_date: asOfDate,
          holdings: formattedHoldings,
          totals: totals,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get holdings',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_dividend_history tool call
 */
async function handleGetDividendHistory(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Extract and validate parameters
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const startDate = args.start_date || `${currentYear}-01-01`;
    const endDate = args.end_date || today;
    const groupBy = args.group_by || 'fund';
    const calculateYield = args.calculate_yield || false;

    // Query dividends
    const { data: dividends, error } = await supabase
      .from('dividends')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!dividends || dividends.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `No dividends found between ${startDate} and ${endDate}`,
            start_date: startDate,
            end_date: endDate
          }, null, 2)
        }]
      };
    }

    // Group dividends based on groupBy parameter
    const grouped = {};
    let totalAmount = 0;

    dividends.forEach(div => {
      totalAmount += parseFloat(div.amount);
      let key;

      if (groupBy === 'fund') {
        key = div.fund;
      } else if (groupBy === 'month') {
        const date = new Date(div.date);
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'quarter') {
        const date = new Date(div.date);
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
      }

      if (!grouped[key]) {
        grouped[key] = {
          group: key,
          dividends: [],
          total_amount: 0,
          count: 0
        };
      }

      grouped[key].dividends.push({
        date: div.date,
        fund: div.fund,
        account: div.account,
        amount: parseFloat(div.amount),
        dividend_type: div.dividend_type,
        payment_frequency: div.payment_frequency
      });
      grouped[key].total_amount += parseFloat(div.amount);
      grouped[key].count++;
    });

    // Convert to array and sort
    const groupedArray = Object.values(grouped);
    groupedArray.sort((a, b) => b.total_amount - a.total_amount);

    // Calculate yield if requested
    let yieldData = null;
    if (calculateYield) {
      // Get current holdings for yield calculation
      const { data: holdings } = await supabase
        .from('holdings_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(10); // Get latest snapshot per fund

      if (holdings && holdings.length > 0) {
        const latestHoldings = {};
        holdings.forEach(h => {
          if (!latestHoldings[h.fund]) {
            latestHoldings[h.fund] = h;
          }
        });

        yieldData = {};
        Object.keys(latestHoldings).forEach(fund => {
          const fundDividends = dividends.filter(d => d.fund === fund);
          const annualDividends = fundDividends.reduce((sum, d) => sum + parseFloat(d.amount), 0);
          const currentValue = parseFloat(latestHoldings[fund].market_value);
          if (currentValue > 0) {
            yieldData[fund] = {
              annual_dividends: annualDividends,
              current_value: currentValue,
              yield_percent: ((annualDividends / currentValue) * 100).toFixed(2)
            };
          }
        });
      }
    }

    // Format as text
    const formattedText = formatDividendsAsText(groupedArray, totalAmount, startDate, endDate, groupBy, yieldData);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          start_date: startDate,
          end_date: endDate,
          group_by: groupBy,
          total_amount: totalAmount,
          total_payments: dividends.length,
          grouped: groupedArray,
          yield_data: yieldData,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get dividend history',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle search_transactions tool call
 */
async function handleSearchTransactions(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Extract and validate parameters
    const startDate = args.start_date;
    const endDate = args.end_date;
    const fund = args.fund;
    const activity = args.activity;
    const moneySource = args.money_source;
    const limit = Math.min(args.limit || 50, 500); // Cap at 500
    const sort = args.sort || 'date_desc';

    // Build query
    let query = supabase.from('transactions').select('*');

    // Apply filters
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }
    if (fund) {
      query = query.ilike('fund', `%${fund}%`);
    }
    if (activity) {
      query = query.eq('activity', activity);
    }
    if (moneySource) {
      query = query.eq('money_source', moneySource);
    }

    // Apply sorting
    if (sort === 'date_desc') {
      query = query.order('date', { ascending: false });
    } else if (sort === 'date_asc') {
      query = query.order('date', { ascending: true });
    } else if (sort === 'amount_desc') {
      query = query.order('amount', { ascending: false });
    }

    // Apply limit
    query = query.limit(limit);

    const { data: transactions, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!transactions || transactions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'No transactions found matching the criteria',
            filters: { startDate, endDate, fund, activity, moneySource }
          }, null, 2)
        }]
      };
    }

    // Format transactions
    const formattedTransactions = transactions.map(t => ({
      date: t.date,
      fund: t.fund,
      activity: t.activity,
      money_source: t.money_source,
      shares: t.units ? parseFloat(t.units) : null,
      unit_price: t.unit_price ? parseFloat(t.unit_price) : null,
      amount: parseFloat(t.amount),
      source_type: t.source_type
    }));

    // Calculate summary
    const summary = {
      count: transactions.length,
      total_amount: formattedTransactions.reduce((sum, t) => sum + t.amount, 0),
      date_range: {
        earliest: transactions[transactions.length - 1]?.date,
        latest: transactions[0]?.date
      },
      by_activity: {}
    };

    // Group by activity for summary
    formattedTransactions.forEach(t => {
      if (!summary.by_activity[t.activity]) {
        summary.by_activity[t.activity] = { count: 0, total: 0 };
      }
      summary.by_activity[t.activity].count++;
      summary.by_activity[t.activity].total += t.amount;
    });

    // Format as text
    const formattedText = formatTransactionsAsText(formattedTransactions, summary, { startDate, endDate, fund, activity, moneySource });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          filters: { startDate, endDate, fund, activity, moneySource },
          transactions: formattedTransactions,
          summary: summary,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to search transactions',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_performance_history tool call
 */
async function handleGetPerformanceHistory(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Extract and validate parameters
    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const defaultStart = oneYearAgo.toISOString().split('T')[0];

    const startDate = args.start_date || defaultStart;
    const endDate = args.end_date || today;
    const interval = args.interval || 'daily';
    const includeContributions = args.include_contributions !== false; // default true
    const calculateReturns = args.calculate_returns !== false; // default true

    // Query portfolio snapshots
    const { data: snapshots, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date', { ascending: true });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!snapshots || snapshots.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `No portfolio snapshots found between ${startDate} and ${endDate}`,
            start_date: startDate,
            end_date: endDate
          }, null, 2)
        }]
      };
    }

    // Apply interval filtering
    let filteredSnapshots = snapshots;
    if (interval === 'weekly') {
      // Take one snapshot per week (last snapshot of each week)
      const weeklySnapshots = {};
      snapshots.forEach(s => {
        const date = new Date(s.snapshot_date);
        const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
        weeklySnapshots[weekKey] = s;
      });
      filteredSnapshots = Object.values(weeklySnapshots);
    } else if (interval === 'monthly') {
      // Take one snapshot per month (last snapshot of each month)
      const monthlySnapshots = {};
      snapshots.forEach(s => {
        const date = new Date(s.snapshot_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlySnapshots[monthKey] || s.snapshot_date > monthlySnapshots[monthKey].snapshot_date) {
          monthlySnapshots[monthKey] = s;
        }
      });
      filteredSnapshots = Object.values(monthlySnapshots).sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date)
      );
    }

    // Calculate performance metrics
    const firstSnapshot = filteredSnapshots[0];
    const lastSnapshot = filteredSnapshots[filteredSnapshots.length - 1];

    const startingValue = parseFloat(firstSnapshot.total_market_value);
    const endingValue = parseFloat(lastSnapshot.total_market_value);
    const totalChange = endingValue - startingValue;
    const totalChangePercent = ((totalChange / startingValue) * 100).toFixed(2);

    const startContributions = parseFloat(firstSnapshot.cumulative_contributions || 0);
    const endContributions = parseFloat(lastSnapshot.cumulative_contributions || 0);
    const contributionsAdded = endContributions - startContributions;
    const marketGain = totalChange - contributionsAdded;
    const marketGainPercent = startingValue > 0 ? ((marketGain / startingValue) * 100).toFixed(2) : '0.00';

    // Find best and worst periods
    let bestPeriod = null;
    let worstPeriod = null;
    for (let i = 1; i < filteredSnapshots.length; i++) {
      const prev = parseFloat(filteredSnapshots[i-1].total_market_value);
      const curr = parseFloat(filteredSnapshots[i].total_market_value);
      const change = curr - prev;

      if (!bestPeriod || change > bestPeriod.change) {
        bestPeriod = {
          date: filteredSnapshots[i].snapshot_date,
          change: change,
          changePercent: ((change / prev) * 100).toFixed(2)
        };
      }
      if (!worstPeriod || change < worstPeriod.change) {
        worstPeriod = {
          date: filteredSnapshots[i].snapshot_date,
          change: change,
          changePercent: ((change / prev) * 100).toFixed(2)
        };
      }
    }

    // Calculate CAGR if more than 1 year
    let cagr = null;
    if (calculateReturns) {
      const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
      const yearsDiff = daysDiff / 365.25;
      if (yearsDiff >= 1 && startingValue > 0) {
        cagr = (Math.pow(endingValue / startingValue, 1 / yearsDiff) - 1) * 100;
        cagr = cagr.toFixed(2);
      }
    }

    // Format timeline data
    const timeline = filteredSnapshots.map(s => ({
      date: s.snapshot_date,
      market_value: parseFloat(s.total_market_value),
      cost_basis: parseFloat(s.total_cost_basis),
      gain_loss: parseFloat(s.total_gain_loss),
      cumulative_contributions: includeContributions ? parseFloat(s.cumulative_contributions || 0) : undefined
    }));

    const metrics = {
      start_date: startDate,
      end_date: endDate,
      interval: interval,
      starting_value: startingValue,
      ending_value: endingValue,
      total_change: totalChange,
      total_change_percent: totalChangePercent,
      contributions_added: includeContributions ? contributionsAdded : undefined,
      market_gain: includeContributions ? marketGain : undefined,
      market_gain_percent: includeContributions ? marketGainPercent : undefined,
      best_period: bestPeriod,
      worst_period: worstPeriod,
      cagr: cagr,
      data_points: filteredSnapshots.length
    };

    // Format as text
    const formattedText = formatPerformanceHistoryAsText(metrics, timeline, includeContributions);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          metrics: metrics,
          timeline: timeline,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get performance history',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_fund_performance tool call
 */
async function handleGetFundPerformance(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Extract and validate parameters
    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const defaultStart = oneYearAgo.toISOString().split('T')[0];

    const startDate = args.start_date || defaultStart;
    const endDate = args.end_date || today;
    const ticker = args.ticker;
    const compareFunds = args.compare_funds || false;
    const calculateCagr = args.calculate_cagr !== false; // default true

    // Build query
    let query = supabase
      .from('fund_snapshots')
      .select('*')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date', { ascending: true });

    if (ticker) {
      query = query.eq('ticker', ticker);
    }

    const { data: fundSnapshots, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!fundSnapshots || fundSnapshots.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: ticker ?
              `No fund snapshots found for ${ticker} between ${startDate} and ${endDate}` :
              `No fund snapshots found between ${startDate} and ${endDate}`,
            start_date: startDate,
            end_date: endDate
          }, null, 2)
        }]
      };
    }

    // Group by ticker/fund
    const fundGroups = {};
    fundSnapshots.forEach(snap => {
      const key = snap.ticker;
      if (!fundGroups[key]) {
        fundGroups[key] = {
          ticker: snap.ticker,
          fund_name: snap.fund_name,
          snapshots: []
        };
      }
      fundGroups[key].snapshots.push(snap);
    });

    // Calculate performance for each fund
    const fundPerformance = Object.values(fundGroups).map(fund => {
      const snapshots = fund.snapshots;
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];

      const startValue = parseFloat(first.market_value);
      const endValue = parseFloat(last.market_value);
      const totalReturn = endValue - startValue;
      const totalReturnPercent = startValue > 0 ? ((totalReturn / startValue) * 100).toFixed(2) : '0.00';

      const startShares = parseFloat(first.shares);
      const endShares = parseFloat(last.shares);
      const shareChange = endShares - startShares;

      const startPrice = parseFloat(first.current_price);
      const endPrice = parseFloat(last.current_price);
      const priceChange = endPrice - startPrice;
      const priceChangePercent = startPrice > 0 ? ((priceChange / startPrice) * 100).toFixed(2) : '0.00';

      // Calculate CAGR if requested
      let cagr = null;
      if (calculateCagr) {
        const daysDiff = (new Date(last.snapshot_date) - new Date(first.snapshot_date)) / (1000 * 60 * 60 * 24);
        const yearsDiff = daysDiff / 365.25;
        if (yearsDiff >= 1 && startValue > 0) {
          cagr = (Math.pow(endValue / startValue, 1 / yearsDiff) - 1) * 100;
          cagr = cagr.toFixed(2);
        }
      }

      return {
        ticker: fund.ticker,
        fund_name: fund.fund_name,
        start_date: first.snapshot_date,
        end_date: last.snapshot_date,
        start_value: startValue,
        end_value: endValue,
        total_return: totalReturn,
        total_return_percent: totalReturnPercent,
        start_shares: startShares,
        end_shares: endShares,
        share_change: shareChange,
        start_price: startPrice,
        end_price: endPrice,
        price_change: priceChange,
        price_change_percent: priceChangePercent,
        cagr: cagr,
        data_points: snapshots.length
      };
    });

    // Sort by total return (best performers first)
    fundPerformance.sort((a, b) => parseFloat(b.total_return_percent) - parseFloat(a.total_return_percent));

    // Format as text
    const formattedText = formatFundPerformanceAsText(fundPerformance, compareFunds);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          start_date: startDate,
          end_date: endDate,
          funds: fundPerformance,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get fund performance',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Handle get_current_prices tool call
 */
async function handleGetCurrentPrices(args, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    const ticker = args.ticker;

    // Build query
    let query = supabase
      .from('current_etf_prices')
      .select('*')
      .order('ticker', { ascending: true });

    if (ticker) {
      query = query.eq('ticker', ticker);
    }

    const { data: prices, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!prices || prices.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: ticker ?
              `No price data found for ${ticker}` :
              'No current prices available',
            ticker: ticker
          }, null, 2)
        }]
      };
    }

    // Format price data
    const formattedPrices = prices.map(p => ({
      ticker: p.ticker,
      price: parseFloat(p.price),
      change_percent: p.change_percent ? parseFloat(p.change_percent) : null,
      updated_at: p.updated_at
    }));

    // Format as text
    const formattedText = formatCurrentPricesAsText(formattedPrices);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          prices: formattedPrices,
          last_update: prices[0]?.updated_at,
          formatted: formattedText
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to get current prices',
          message: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

// ============================================================================
// CLOUDFLARE WORKER HANDLER
// ============================================================================

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Verify auth token (supports both header and URL parameter)
    const url = new URL(request.url);
    const urlToken = url.searchParams.get('auth_token');
    const authHeader = request.headers.get('Authorization');

    const isValidHeader = authHeader === `Bearer ${env.MCP_AUTH_TOKEN}`;
    const isValidUrlParam = urlToken === env.MCP_AUTH_TOKEN;

    if (!isValidHeader && !isValidUrlParam) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle GET requests (for health checks / connection tests)
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'Voya MCP Server',
        version: '1.0.0',
        tools: ['parse_voya_transactions', 'import_voya_transactions', 'get_portfolio_summary']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Only allow POST requests for MCP protocol
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();
      const { jsonrpc, method, params, id } = body;

      // Log incoming method for debugging
      console.log(`MCP Request: method=${method}, id=${id}`);

      // Validate JSON-RPC format
      if (jsonrpc !== '2.0') {
        console.error('Invalid JSON-RPC version:', jsonrpc);
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: id || null
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let result;

      // Handle MCP methods
      if (method === 'initialize') {
        // MCP initialization handshake
        result = {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'voya-importer',
            version: '1.0.0'
          },
          capabilities: {
            tools: {}
          }
        };
      } else if (method === 'notifications/initialized') {
        // Client notification after initialization - no response needed
        // Just return empty result (notification acknowledgment)
        console.log('Client initialized notification received');
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          result: {},
          id: id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (method === 'tools/list') {
        result = handleToolsList();
      } else if (method === 'tools/call') {
        const { name, arguments: args } = params;

        if (name === 'parse_voya_transactions') {
          result = await handleParseTransactions(args);
        } else if (name === 'import_voya_transactions') {
          result = await handleImportTransactions(args, env);
        } else if (name === 'get_portfolio_summary') {
          result = await handleGetPortfolioSummary(args, env);
        } else if (name === 'get_holdings') {
          result = await handleGetHoldings(args, env);
        } else if (name === 'get_dividend_history') {
          result = await handleGetDividendHistory(args, env);
        } else if (name === 'search_transactions') {
          result = await handleSearchTransactions(args, env);
        } else if (name === 'get_performance_history') {
          result = await handleGetPerformanceHistory(args, env);
        } else if (name === 'get_fund_performance') {
          result = await handleGetFundPerformance(args, env);
        } else if (name === 'get_current_prices') {
          result = await handleGetCurrentPrices(args, env);
        } else {
          result = {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${name}` })
            }],
            isError: true
          };
        }
      } else {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Return successful response
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        result,
        id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('MCP Server Error:', error);
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        },
        id: null
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
