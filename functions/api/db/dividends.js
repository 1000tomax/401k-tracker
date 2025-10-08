/**
 * @file functions/api/db/dividends.js
 * @description Cloudflare Worker function to provide a direct API for the `dividends` database table.
 * It handles GET requests for fetching dividend records with filtering and pagination, and POST
 * requests for importing new dividends with deduplication logic.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * A simple, non-cryptographic hashing function.
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
 * Generates a hash for a dividend object based on its key properties for deduplication.
 * @param {object} dividend - The dividend object.
 * @returns {string} A short hexadecimal hash string.
 */
function generateDividendHash(dividend) {
  const { date, fund, account, amount } = dividend;
  const hashData = `${date}|${fund?.toLowerCase() || ''}|${account?.toLowerCase() || ''}|${amount}`;
  return simpleHash(hashData);
}

/**
 * Handles GET requests to fetch dividend records from the database.
 * Supports filtering by fund, account, date range, and source type, as well as pagination.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response containing the list of dividends and pagination info.
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
    const params = url.searchParams;

    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '1000');
    const offset = (page - 1) * limit;

    const fund = params.get('fund');
    const account = params.get('account');
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');
    const sourceType = params.get('source_type');

    const supabase = createSupabaseAdmin(env);
    let query = supabase
      .from('dividends')
      .select('*', { count: 'exact' });

    if (fund) query = query.eq('fund', fund);
    if (account) query = query.eq('account', account);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (sourceType) query = query.eq('source_type', sourceType);

    query = query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: dividends, error, count } = await query;

    if (error) throw error;

    // Transform snake_case to camelCase for frontend
    const transformedDividends = (dividends || []).map(div => ({
      ...div,
      sourceType: div.source_type,
      sourceId: div.source_id,
      plaidTransactionId: div.plaid_transaction_id,
      plaidAccountId: div.plaid_account_id,
      securityId: div.security_id,
      securityType: div.security_type,
      dividendType: div.dividend_type,
      paymentFrequency: div.payment_frequency,
      exDate: div.ex_date,
      recordDate: div.record_date,
      dividendHash: div.dividend_hash,
      importedAt: div.imported_at,
      createdAt: div.created_at,
    }));

    return jsonResponse({
      ok: true,
      dividends: transformedDividends,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    }, 200, env);

  } catch (error) {
    console.error('Error in dividends GET:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}

/**
 * Handles POST requests to import new dividends into the database.
 * It performs deduplication using a hash to prevent duplicate entries.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response summarizing the result of the import operation.
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
    const body = await request.json();
    const { dividends, connection_id } = body;

    if (!dividends || !Array.isArray(dividends)) {
      return jsonResponse({ ok: false, error: 'Missing or invalid dividends array' }, 400, env);
    }

    const supabase = createSupabaseAdmin(env);
    const results = {
      total: dividends.length,
      imported: 0,
      duplicates: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const dividend of dividends) {
      try {
        // Generate hash if not provided
        const dividendHash = dividend.dividendHash || dividend.dividend_hash || generateDividendHash(dividend);

        // Check for duplicate by hash
        const { data: existing } = await supabase
          .from('dividends')
          .select('id')
          .eq('dividend_hash', dividendHash)
          .single();

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Prepare dividend data
        const dividendData = {
          date: dividend.date,
          fund: dividend.fund,
          account: dividend.account,
          amount: dividend.amount,
          source_type: dividend.sourceType || dividend.source_type || 'plaid',
          source_id: dividend.sourceId || dividend.source_id,
          plaid_transaction_id: dividend.plaidTransactionId || dividend.plaid_transaction_id,
          plaid_account_id: dividend.plaidAccountId || dividend.plaid_account_id,
          security_id: dividend.securityId || dividend.security_id,
          security_type: dividend.securityType || dividend.security_type,
          dividend_type: dividend.dividendType || dividend.dividend_type || 'ordinary',
          payment_frequency: dividend.paymentFrequency || dividend.payment_frequency,
          ex_date: dividend.exDate || dividend.ex_date,
          record_date: dividend.recordDate || dividend.record_date,
          dividend_hash: dividendHash,
          metadata: dividend.metadata || {},
          imported_at: new Date().toISOString(),
        };

        // Insert dividend
        const { error: insertError } = await supabase
          .from('dividends')
          .insert(dividendData);

        if (insertError) {
          // Check if it's a duplicate constraint violation
          if (insertError.code === '23505') {
            results.duplicates++;
          } else {
            throw insertError;
          }
        } else {
          results.imported++;
        }

      } catch (dividendError) {
        console.error('Error importing dividend:', dividendError);
        results.errors++;
        results.errorDetails.push({
          dividend: `${dividend.date} - ${dividend.fund}`,
          error: dividendError.message,
        });
      }
    }

    // Update connection last_synced_at if connection_id provided
    if (connection_id && results.imported > 0) {
      await supabase
        .from('plaid_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connection_id);
    }

    return jsonResponse({ ok: true, results }, 200, env);

  } catch (error) {
    console.error('Error in dividends POST:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}
