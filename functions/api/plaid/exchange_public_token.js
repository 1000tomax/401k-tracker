/**
 * Exchange Plaid public token for access token
 * Cloudflare Workers function
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { handleCors, jsonResponse } from '../../../src/utils/cors-workers.js';

// Initialize Plaid client
function initializePlaidClient(env) {
  const PLAID_CLIENT_ID = env.PLAID_CLIENT_ID;
  const PLAID_SECRET = env.PLAID_SECRET;
  const PLAID_ENV = env.PLAID_ENV || 'sandbox';

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

export async function onRequestPost(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  try {
    // Parse request body
    const body = await request.json();
    const { public_token } = body || {};

    console.log('Token exchange request received:', {
      public_token: public_token?.substring(0, 20) + '...',
      has_public_token: !!public_token
    });

    if (!public_token) {
      console.log('Missing public_token in request');
      return jsonResponse({ error: 'Missing public_token' }, 400, env);
    }

    // Exchange the public_token for an access_token
    const { plaidClient } = initializePlaidClient(env);
    const exchangeRequest = {
      public_token: public_token,
    };

    const exchangeResponse = await plaidClient.itemPublicTokenExchange(exchangeRequest);
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    console.log('Plaid token exchange successful:', {
      item_id: itemId,
      token_length: accessToken.length,
    });

    return jsonResponse({
      access_token: accessToken,
      item_id: itemId,
    }, 200, env);

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
      return jsonResponse({
        error: error.response.data || 'Plaid API error',
      }, error.response.status || 400, env);
    } else {
      // Other error
      return jsonResponse({
        error: 'Internal server error',
        message: error.message,
      }, 500, env);
    }
  }
}