/**
 * Debug endpoint to see raw Plaid investment transactions response
 */
import { initializePlaidClient } from '../../../src/lib/plaidConfig.js';
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const supabase = createSupabaseAdmin(env);
    const { plaidClient } = initializePlaidClient(env);

    // Get first active Plaid connection
    const { data: connections, error: dbError } = await supabase
      .from('plaid_connections')
      .select('*')
      .limit(1);

    if (dbError) throw dbError;
    if (!connections || connections.length === 0) {
      return jsonResponse({ ok: false, error: 'No Plaid connections found' }, 404, env);
    }

    const connection = connections[0];

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Fetching transactions for ${connection.institution_name} from ${startDate} to ${endDate}`);

    // Fetch investment transactions from Plaid
    const response = await plaidClient.investmentsTransactionsGet({
      access_token: connection.access_token,
      start_date: startDate,
      end_date: endDate,
    });

    const { investment_transactions, accounts, securities } = response.data;

    // Count transaction types
    const typeBreakdown = {};
    investment_transactions.forEach(tx => {
      const key = `${tx.type}/${tx.subtype}`;
      typeBreakdown[key] = (typeBreakdown[key] || 0) + 1;
    });

    // Find any cash/dividend transactions
    const dividendTransactions = investment_transactions.filter(tx =>
      tx.type === 'cash' && tx.subtype === 'dividend'
    );

    return jsonResponse({
      ok: true,
      institution: connection.institution_name,
      date_range: { start_date: startDate, end_date: endDate },
      total_transactions: investment_transactions.length,
      type_breakdown: typeBreakdown,
      dividend_count: dividendTransactions.length,
      dividends: dividendTransactions,
      securities_count: securities.length,
      accounts_count: accounts.length,
      // Include first 5 transactions as sample
      sample_transactions: investment_transactions.slice(0, 5),
    }, 200, env);

  } catch (error) {
    console.error('Error fetching Plaid data:', error);
    return jsonResponse({
      ok: false,
      error: error.message,
    }, 500, env);
  }
}
