/**
 * Get investment transactions from Plaid
 * Vercel serverless function
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Initialize Plaid client
function initializePlaidClient() {
  const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
  const PLAID_SECRET = process.env.PLAID_SECRET;
  const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error('Missing Plaid credentials. Please check your environment variables.');
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });

  const plaidClient = new PlaidApi(configuration);
  const config = {
    PLAID_CLIENT_ID,
    PLAID_SECRET,
    PLAID_ENV,
  };

  return { plaidClient, config };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle request body parsing for Vercel
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { access_token, start_date, end_date } = body || {};

    if (!access_token) {
      return res.status(400).json({ error: 'Missing access_token' });
    }

    // Default to last 90 days if no dates provided
    const startDate = start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    const { plaidClient } = initializePlaidClient();
    const investmentTransactionsRequest = {
      access_token: access_token,
      start_date: startDate,
      end_date: endDate,
    };

    const investmentResponse = await plaidClient.investmentsTransactionsGet(investmentTransactionsRequest);

    const {
      investment_transactions,
      securities,
      accounts,
      total_investment_transactions
    } = investmentResponse.data;

    console.log(`Retrieved ${investment_transactions.length} investment transactions`);

    // Transform the data for easier consumption by the frontend
    const enrichedTransactions = investment_transactions.map(transaction => {
      // Find the security information
      const security = securities.find(sec => sec.security_id === transaction.security_id);

      // Find the account information
      const account = accounts.find(acc => acc.account_id === transaction.account_id);

      return {
        ...transaction,
        security_name: security?.name || 'Unknown Security',
        security_ticker: security?.ticker_symbol || '',
        security_type: security?.type || '',
        account_name: account?.name || 'Unknown Account',
        account_type: account?.type || '',
        account_subtype: account?.subtype || '',
      };
    });

    return res.status(200).json({
      investment_transactions: enrichedTransactions,
      securities: securities,
      accounts: accounts,
      total_investment_transactions: total_investment_transactions,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    });

  } catch (error) {
    console.error('Error getting investment transactions:', error);

    if (error.response) {
      // Plaid API error
      return res.status(error.response.status || 400).json({
        error: error.response.data || 'Plaid API error',
      });
    } else {
      // Other error
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
}