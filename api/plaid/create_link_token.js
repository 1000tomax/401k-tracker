/**
 * Create Plaid Link Token endpoint
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
    PLAID_PRODUCTS: PLAID_ENV === 'production' ?
      ['investments'] : // Only investments approved for production
      (process.env.PLAID_PRODUCTS || 'auth,transactions,investments').split(','), // All products for sandbox
    PLAID_COUNTRY_CODES: (process.env.PLAID_COUNTRY_CODES || 'US').split(','),
  };

  return { plaidClient, config };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Environment variables check:', {
      hasClientId: !!process.env.PLAID_CLIENT_ID,
      hasSecret: !!process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV,
      clientIdLength: process.env.PLAID_CLIENT_ID?.length || 0
    });

    const { plaidClient, config } = initializePlaidClient();

    // Handle request body parsing for Vercel
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { user_id = 'default-user' } = body || {};

    const linkTokenRequest = {
      user: {
        client_user_id: user_id,
      },
      client_name: '401K Tracker',
      products: config.PLAID_PRODUCTS,
      country_codes: config.PLAID_COUNTRY_CODES,
      language: 'en',
      webhook: config.PLAID_ENV === 'production' ?
        'https://401k-tracker.vercel.app/api/plaid/webhook' : // Production webhook URL
        'http://localhost:5175/api/plaid/webhook', // Local development webhook
    };

    const linkTokenResponse = await plaidClient.linkTokenCreate(linkTokenRequest);
    const linkToken = linkTokenResponse.data.link_token;

    return res.status(200).json({
      link_token: linkToken,
      expiration: linkTokenResponse.data.expiration,
    });

  } catch (error) {
    console.error('Error creating link token:', error);

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