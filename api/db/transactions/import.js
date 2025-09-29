/**
 * Import transactions with deduplication
 * POST /api/db/transactions/import
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * Generate deduplication hashes for a transaction
 */
function generateHashes(transaction) {
  const { date, amount, fund, activity, units, unit_price } = transaction;

  // Primary hash: date|amount|fund|activity (exact match)
  const primaryData = `${date}|${amount}|${fund?.toLowerCase() || ''}|${activity?.toLowerCase() || ''}`;
  const transactionHash = simpleHash(primaryData);

  // Fuzzy hash: date|amount|fund (similar transactions)
  const fuzzyData = `${date}|${amount}|${fund?.toLowerCase() || ''}`;
  const fuzzyHash = simpleHash(fuzzyData);

  // Enhanced hash: includes units and price
  const enhancedData = `${date}|${amount}|${fund?.toLowerCase() || ''}|${units || ''}|${unit_price || ''}`;
  const enhancedHash = simpleHash(enhancedData);

  return {
    transaction_hash: transactionHash,
    fuzzy_hash: fuzzyHash,
    enhanced_hash: enhancedHash,
    hash_data: {
      primary: primaryData,
      fuzzy: fuzzyData,
      enhanced: enhancedData,
    },
  };
}

/**
 * Simple hash function (same as existing system)
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

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Require authentication
  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { transactions } = body;

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
        // Generate hashes
        const hashes = generateHashes(transaction);

        // Check for existing transaction by hash
        const { data: existing } = await supabase
          .from('transactions')
          .select('id, plaid_transaction_id')
          .eq('transaction_hash', hashes.transaction_hash)
          .single();

        // Prepare transaction data
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
          // Check if Plaid transaction ID matches or if this is an update
          if (transactionData.plaid_transaction_id &&
              existing.plaid_transaction_id !== transactionData.plaid_transaction_id) {
            // Different Plaid IDs but same hash - potential duplicate
            results.duplicates++;
          } else {
            // Update existing transaction
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
          // Insert new transaction
          const { error: insertError } = await supabase
            .from('transactions')
            .insert({
              ...transactionData,
              imported_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            });

          if (insertError) {
            // Check if it's a unique constraint violation on plaid_transaction_id
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

    return send(res, 200, {
      ok: true,
      results,
    });
  } catch (error) {
    console.error('Error importing transactions:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to import transactions',
      details: error.message,
    });
  }
}