/**
 * Consolidated transactions endpoint
 * Handles GET (list), POST (import), and sync operations
 */
import { createSupabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

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

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    // GET - List transactions
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const params = url.searchParams;

      const page = parseInt(params.get('page') || '1');
      const limit = parseInt(params.get('limit') || '1000');
      const offset = (page - 1) * limit;

      const fund = params.get('fund');
      const startDate = params.get('start_date');
      const endDate = params.get('end_date');
      const sourceType = params.get('source_type');
      const moneySource = params.get('money_source');

      const supabase = createSupabaseAdmin();
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

      return send(res, 200, {
        ok: true,
        transactions: transactions || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      });
    }

    // POST - Import transactions
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { transactions, connection_id } = body;

      if (!transactions || !Array.isArray(transactions)) {
        return send(res, 400, { ok: false, error: 'Missing or invalid transactions array' });
      }

      const supabase = createSupabaseAdmin();
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

      return send(res, 200, { ok: true, results });
    }

    // Method not allowed
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Error in transactions endpoint:', error);
    return send(res, 500, {
      ok: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}