/**
 * @file functions/api/plaid/exchange_public_token.js
 * @description Cloudflare Worker function to exchange a Plaid `public_token` for an `access_token`.
 * After a user successfully connects their account via Plaid Link, the frontend receives a
 * short-lived `public_token`, which must be exchanged for a permanent `access_token` on the server.
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { handleCors, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * Initializes the Plaid API client with credentials from environment variables.
 * @param {object} env - The Cloudflare Worker environment object.
 * @returns {{plaidClient: PlaidApi, config: object}} An object with the initialized Plaid client and config.
 * @throws {Error} If Plaid credentials are not configured.
 */
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

/**
 * Handles POST requests to exchange a Plaid public_token for an access_token.
 * @param {object} context - The Cloudflare Worker context object.
 * @param {Request} context.request - The incoming request, which should contain the public_token in its JSON body.
 * @param {object} context.env - The environment variables.
 * @returns {Response} A JSON response containing the `access_token` and `item_id`, or an error.
 */
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