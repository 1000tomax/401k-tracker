/**
 * Migrate existing transaction data from JSON file to Supabase
 * POST /api/db/migrate-data
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
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
    const { dryRun = false, clearExisting = false } = body;

    // Read existing data file
    const dataPath = path.join(__dirname, '../../data/401k-data.json');
    const dataContent = await fs.readFile(dataPath, 'utf-8');
    const data = JSON.parse(dataContent);

    if (!data.transactions || !Array.isArray(data.transactions)) {
      return send(res, 400, { ok: false, error: 'Invalid data format: missing transactions array' });
    }

    const supabase = createSupabaseAdmin();

    // Clear existing transactions if requested
    if (clearExisting && !dryRun) {
      console.log('Clearing existing transactions...');
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) {
        console.error('Error clearing transactions:', deleteError);
      }
    }

    // Prepare transactions for import
    const transformedTransactions = data.transactions.map(tx => ({
      date: tx.date,
      fund: tx.fund,
      money_source: tx.moneySource || tx.money_source,
      activity: tx.activity,
      units: tx.units,
      unit_price: tx.unitPrice || tx.unit_price,
      amount: tx.amount,
      source_type: tx.sourceType || tx.source_type || 'manual',
      source_id: tx.sourceId || tx.source_id,
      plaid_transaction_id: tx.plaidTransactionId || tx.plaid_transaction_id,
      plaid_account_id: tx.plaidAccountId || tx.plaid_account_id,
      transaction_hash: tx.transactionHash || tx.transaction_hash,
      fuzzy_hash: tx.fuzzyHash || tx.fuzzy_hash,
      enhanced_hash: tx.enhancedHash || tx.enhanced_hash,
      hash_data: tx.hashData || tx.hash_data,
      imported_at: tx.importedAt || tx.imported_at || new Date().toISOString(),
      last_updated_at: tx.lastUpdatedAt || tx.last_updated_at || new Date().toISOString(),
      metadata: tx.metadata || {},
    }));

    if (dryRun) {
      return send(res, 200, {
        ok: true,
        dryRun: true,
        message: 'Dry run completed - no data was imported',
        stats: {
          totalTransactions: transformedTransactions.length,
          dateRange: {
            earliest: transformedTransactions.reduce((min, tx) => tx.date < min ? tx.date : min, transformedTransactions[0]?.date),
            latest: transformedTransactions.reduce((max, tx) => tx.date > max ? tx.date : max, transformedTransactions[0]?.date),
          },
          sourcesTypes: [...new Set(transformedTransactions.map(tx => tx.source_type))],
          funds: [...new Set(transformedTransactions.map(tx => tx.fund))].length,
        },
      });
    }

    // Import transactions using the import endpoint
    const results = {
      total: transformedTransactions.length,
      imported: 0,
      duplicates: 0,
      updated: 0,
      errors: 0,
      errorDetails: [],
    };

    // Import in batches of 100
    const batchSize = 100;
    for (let i = 0; i < transformedTransactions.length; i += batchSize) {
      const batch = transformedTransactions.slice(i, i + batchSize);

      try {
        const { data: inserted, error } = await supabase
          .from('transactions')
          .upsert(batch, {
            onConflict: 'plaid_transaction_id',
            ignoreDuplicates: false,
          })
          .select();

        if (error) {
          console.error('Batch import error:', error);
          results.errors += batch.length;
          results.errorDetails.push({
            batch: Math.floor(i / batchSize) + 1,
            error: error.message,
          });
        } else {
          results.imported += inserted?.length || 0;
        }
      } catch (batchError) {
        console.error('Batch error:', batchError);
        results.errors += batch.length;
        results.errorDetails.push({
          batch: Math.floor(i / batchSize) + 1,
          error: batchError.message,
        });
      }
    }

    return send(res, 200, {
      ok: true,
      message: 'Data migration completed',
      results,
    });
  } catch (error) {
    console.error('Error migrating data:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to migrate data',
      details: error.message,
    });
  }
}