/**
 * Get accounts information from Plaid
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

    const { access_token } = body || {};

    if (!access_token) {
      return res.status(400).json({ error: 'Missing access_token' });
    }

    const { plaidClient } = initializePlaidClient();
    const accountsRequest = {
      access_token: access_token,
    };

    const accountsResponse = await plaidClient.accountsGet(accountsRequest);
    const accounts = accountsResponse.data.accounts;
    const item = accountsResponse.data.item;

    console.log(`Retrieved ${accounts.length} accounts for item ${item.item_id}`);

    return res.status(200).json({
      accounts: accounts,
      item: item,
    });

  } catch (error) {
    console.error('Error getting accounts:', error);

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