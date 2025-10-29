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
 * Parse Voya transaction text (tab-separated format)
 */
function parseVoyaTransactions(rawText) {
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
 * Create transaction hash for duplicate detection
 */
function createTransactionHash(tx) {
  const parts = [
    tx.date,
    tx.fund,
    tx.moneySource || '',
    tx.activity,
    tx.units?.toFixed(8) || '0',
    tx.amount?.toFixed(2) || '0'
  ];
  return parts.join('|').toLowerCase();
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

      // Validate JSON-RPC format
      if (jsonrpc !== '2.0') {
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
