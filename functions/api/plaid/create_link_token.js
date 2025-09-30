/**
 * Create Plaid Link Token endpoint
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
    PLAID_PRODUCTS: PLAID_ENV === 'production' ?
      ['investments'] : // Only investments approved for production
      (env.PLAID_PRODUCTS || 'auth,transactions,investments').split(','), // All products for sandbox
    PLAID_COUNTRY_CODES: (env.PLAID_COUNTRY_CODES || 'US').split(','),
  };

  return { plaidClient, config };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  try {
    console.log('🔍 Environment variables check:', {
      hasClientId: !!env.PLAID_CLIENT_ID,
      hasSecret: !!env.PLAID_SECRET,
      env: env.PLAID_ENV,
      clientIdLength: env.PLAID_CLIENT_ID?.length || 0
    });

    const { plaidClient, config } = initializePlaidClient(env);

    // Parse request body
    const body = await request.json();
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
        `https://${new URL(request.url).host}/api/plaid/webhook` : // Production webhook URL
        'http://localhost:5175/api/plaid/webhook', // Local development webhook
    };

    const linkTokenResponse = await plaidClient.linkTokenCreate(linkTokenRequest);
    const linkToken = linkTokenResponse.data.link_token;

    return jsonResponse({
      link_token: linkToken,
      expiration: linkTokenResponse.data.expiration,
    }, 200, env);

  } catch (error) {
    console.error('Error creating link token:', error);

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