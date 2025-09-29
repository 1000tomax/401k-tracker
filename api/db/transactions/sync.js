/**
 * Sync transactions from Plaid and import with deduplication
 * POST /api/db/transactions/sync
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function initializePlaidClient() {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  return new PlaidApi(configuration);
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

  const startTime = Date.now();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { connection_id, start_date, end_date } = body;

    if (!connection_id) {
      return send(res, 400, { ok: false, error: 'Missing connection_id' });
    }

    const supabase = createSupabaseAdmin();

    // Get connection details
    const { data: connection, error: connError } = await supabase
      .from('plaid_connections')
      .select('*')
      .eq('id', connection_id)
      .single();

    if (connError || !connection) {
      return send(res, 404, { ok: false, error: 'Connection not found' });
    }

    // Default to last 90 days if no dates provided
    const startDate = start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Fetch transactions from Plaid
    const plaidClient = initializePlaidClient();
    const investmentResponse = await plaidClient.investmentsTransactionsGet({
      access_token: connection.access_token,
      start_date: startDate,
      end_date: endDate,
    });

    const { investment_transactions, securities, accounts } = investmentResponse.data;

    // Transform Plaid transactions to our format
    const transformedTransactions = investment_transactions.map(transaction => {
      const security = securities.find(sec => sec.security_id === transaction.security_id);
      const account = accounts.find(acc => acc.account_id === transaction.account_id);

      return {
        date: transaction.date,
        fund: security?.ticker_symbol || security?.name || 'Unknown',
        moneySource: account?.name || 'Unknown Account',
        activity: transaction.type,
        units: transaction.quantity,
        unitPrice: transaction.price,
        amount: transaction.amount,
        sourceType: 'plaid',
        sourceId: connection.item_id,
        plaidTransactionId: transaction.investment_transaction_id,
        plaidAccountId: transaction.account_id,
        metadata: {
          security_name: security?.name,
          security_type: security?.type,
          account_type: account?.type,
          account_subtype: account?.subtype,
        },
      };
    });

    // Import transactions using the import endpoint logic
    const importUrl = new URL('/api/db/transactions/import', `http://${req.headers.host}`);
    const importBody = { transactions: transformedTransactions };

    // Call import function directly
    const importResponse = await fetch(importUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
      },
      body: JSON.stringify(importBody),
    });

    const importResult = await importResponse.json();

    // Update connection last_synced_at
    await supabase
      .from('plaid_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection_id);

    // Record sync history
    await supabase.from('sync_history').insert({
      connection_id,
      sync_type: 'manual',
      status: importResult.ok ? 'success' : 'error',
      transactions_fetched: transformedTransactions.length,
      transactions_new: importResult.results?.imported || 0,
      transactions_duplicate: importResult.results?.duplicates || 0,
      transactions_updated: importResult.results?.updated || 0,
      start_date: startDate,
      end_date: endDate,
      duration_ms: Date.now() - startTime,
    });

    return send(res, 200, {
      ok: true,
      sync: {
        connection_id,
        item_id: connection.item_id,
        date_range: { start_date: startDate, end_date: endDate },
        fetched: transformedTransactions.length,
        imported: importResult.results?.imported || 0,
        duplicates: importResult.results?.duplicates || 0,
        updated: importResult.results?.updated || 0,
        errors: importResult.results?.errors || 0,
        duration_ms: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('Error syncing transactions:', error);

    // Try to record error in sync history
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.connection_id) {
        const supabase = createSupabaseAdmin();
        await supabase.from('sync_history').insert({
          connection_id: body.connection_id,
          sync_type: 'manual',
          status: 'error',
          error_message: error.message,
          error_details: { stack: error.stack },
          duration_ms: Date.now() - startTime,
        });
      }
    } catch (historyError) {
      console.error('Failed to record sync error:', historyError);
    }

    return send(res, 500, {
      ok: false,
      error: 'Failed to sync transactions',
      details: error.message,
    });
  }
}