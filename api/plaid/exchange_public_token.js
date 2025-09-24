/**
 * Exchange Plaid public token for access token
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

// In-memory storage for development (replace with database in production)
const tokenStore = new Map();

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

    const { public_token } = body || {};

    console.log('Token exchange request received:', {
      public_token: public_token?.substring(0, 20) + '...',
      has_public_token: !!public_token
    });

    if (!public_token) {
      console.log('Missing public_token in request');
      return res.status(400).json({ error: 'Missing public_token' });
    }

    // Exchange the public_token for an access_token
    const { plaidClient } = initializePlaidClient();
    const exchangeRequest = {
      public_token: public_token,
    };

    const exchangeResponse = await plaidClient.itemPublicTokenExchange(exchangeRequest);
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Store the access token (in production, store this securely in a database)
    tokenStore.set(itemId, {
      access_token: accessToken,
      item_id: itemId,
      created_at: new Date().toISOString(),
    });

    console.log('Plaid token exchange successful:', {
      item_id: itemId,
      token_length: accessToken.length,
    });

    return res.status(200).json({
      access_token: accessToken,
      item_id: itemId,
    });

  } catch (error) {
    console.error('Error exchanging public token:', error);
    console.error('Full error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      code: error.code
    });

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

// Export token store for other endpoints
export { tokenStore };