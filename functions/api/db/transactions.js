/**
 * Consolidated transactions endpoint
 * Handles GET (list), POST (import), and sync operations
 * Cloudflare Workers function
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

function generateHashes(transaction) {
  const { date, amount, fund, activity, units, unit_price } = transaction;

  const primaryData = `${date}|${amount}|${fund?.toLowerCase() || ''}|${activity?.toLowerCase() || ''}`;
  const transactionHash = simpleHash(primaryData);

  const fuzzyData = `${date}|${amount}|${fund?.toLowerCase() || ''}`;
  const fuzzyHash = simpleHash(fuzzyData);

  const enhancedData = `${date}|${amount}|${fund?.toLowerCase() || ''}|${units || ''}|${unit_price || ''}`;
  const enhancedHash = simpleHash(enhancedData);

  return {
    transaction_hash: transactionHash,
    fuzzy_hash: fuzzyHash,
    enhanced_hash: enhancedHash,
  };
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

// GET handler
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
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');
    const sourceType = params.get('source_type');
    const moneySource = params.get('money_source');

    const supabase = createSupabaseAdmin(env);
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' });

    if (fund) query = query.eq('fund', fund);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (sourceType) query = query.eq('source_type', sourceType);
    if (moneySource) query = query.eq('money_source', moneySource);

    query = query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) throw error;

    // Transform snake_case to camelCase for frontend
    const transformedTransactions = (transactions || []).map(tx => ({
      ...tx,
      moneySource: tx.money_source,
      unitPrice: tx.unit_price,
      sourceType: tx.source_type,
      sourceId: tx.source_id,
      plaidTransactionId: tx.plaid_transaction_id,
      plaidAccountId: tx.plaid_account_id,
      transactionHash: tx.transaction_hash,
      fuzzyHash: tx.fuzzy_hash,
      enhancedHash: tx.enhanced_hash,
    }));

    return jsonResponse({
      ok: true,
      transactions: transformedTransactions,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    }, 200, env);

  } catch (error) {
    console.error('Error in transactions GET:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}

// POST handler
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
    const { transactions, connection_id } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return jsonResponse({ ok: false, error: 'Missing or invalid transactions array' }, 400, env);
    }

    const supabase = createSupabaseAdmin(env);
    const results = {
      total: transactions.length,
      imported: 0,
      duplicates: 0,
      updated: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const transaction of transactions) {
      try {
        const hashes = generateHashes(transaction);

        const { data: existing } = await supabase
          .from('transactions')
          .select('id, plaid_transaction_id')
          .eq('transaction_hash', hashes.transaction_hash)
          .single();

        const transactionData = {
          date: transaction.date,
          fund: transaction.fund,
          money_source: transaction.moneySource || transaction.money_source,
          activity: transaction.activity,
          units: transaction.units,
          unit_price: transaction.unitPrice || transaction.unit_price,
          amount: transaction.amount,
          source_type: transaction.sourceType || transaction.source_type || 'plaid',
          source_id: transaction.sourceId || transaction.source_id,
          plaid_transaction_id: transaction.plaidTransactionId || transaction.plaid_transaction_id,
          plaid_account_id: transaction.plaidAccountId || transaction.plaid_account_id,
          ...hashes,
          metadata: transaction.metadata || {},
        };

        if (existing) {
          if (transactionData.plaid_transaction_id &&
              existing.plaid_transaction_id !== transactionData.plaid_transaction_id) {
            results.duplicates++;
          } else {
            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                ...transactionData,
                last_updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (updateError) throw updateError;
            results.updated++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('transactions')
            .insert({
              ...transactionData,
              imported_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            });

          if (insertError) {
            if (insertError.code === '23505' && insertError.message.includes('plaid_transaction_id')) {
              results.duplicates++;
            } else {
              throw insertError;
            }
          } else {
            results.imported++;
          }
        }
      } catch (transactionError) {
        console.error('Error importing transaction:', transactionError);
        results.errors++;
        results.errorDetails.push({
          transaction: transaction.plaid_transaction_id || transaction.date,
          error: transactionError.message,
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
    console.error('Error in transactions POST:', error);
    return jsonResponse({
      ok: false,
      error: 'Internal server error',
      details: error.message,
    }, 500, env);
  }
}