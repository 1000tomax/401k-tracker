/**
 * Get accounts information from Plaid
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
    const { access_token } = body || {};

    if (!access_token) {
      return jsonResponse({ error: 'Missing access_token' }, 400, env);
    }

    const { plaidClient } = initializePlaidClient(env);
    const accountsRequest = {
      access_token: access_token,
    };

    const accountsResponse = await plaidClient.accountsGet(accountsRequest);
    const accounts = accountsResponse.data.accounts;
    const item = accountsResponse.data.item;

    console.log(`Retrieved ${accounts.length} accounts for item ${item.item_id}`);

    return jsonResponse({
      accounts: accounts,
      item: item,
    }, 200, env);

  } catch (error) {
    console.error('Error getting accounts:', error);

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