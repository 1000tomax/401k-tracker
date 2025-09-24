/**
 * Get investment transactions from Plaid
 */
import { initializePlaidClient } from './config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    // Read the request body for Vite dev server
    let body = '';
    if (req.body) {
      body = req.body;
    } else {
      // For Vite dev server, we need to read the body stream
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const { access_token, start_date, end_date } = JSON.parse(body || '{}');

    if (!access_token) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Missing access_token' }));
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

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      investment_transactions: enrichedTransactions,
      securities: securities,
      accounts: accounts,
      total_investment_transactions: total_investment_transactions,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
    }));

  } catch (error) {
    console.error('Error getting investment transactions:', error);
    
    if (error.response) {
      // Plaid API error
      res.statusCode = error.response.status || 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: error.response.data || 'Plaid API error',
      }));
    } else {
      // Other error
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }));
    }
  }
}