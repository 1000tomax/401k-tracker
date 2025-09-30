/**
 * Remove/deactivate Plaid Item
 * Called when users disconnect their account or during user offboarding
 * Cloudflare Workers function
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { handleCors, jsonResponse } from '../../../src/utils/cors-workers.js';

// Initialize Plaid client with environment detection
function initializePlaidClient(env, accessToken) {
  const PLAID_CLIENT_ID = env.PLAID_CLIENT_ID;
  let PLAID_SECRET, PLAID_ENV;

  // Detect environment from access token format
  if (accessToken && accessToken.startsWith('access-sandbox-')) {
    PLAID_ENV = 'sandbox';
    PLAID_SECRET = 'e1ce9270bbf8819c547aad6fb0e077'; // sandbox secret
  } else if (accessToken && accessToken.startsWith('access-production-')) {
    PLAID_ENV = 'production';
    PLAID_SECRET = env.PLAID_SECRET; // production secret
  } else {
    // Fallback to environment variable
    PLAID_ENV = env.PLAID_ENV || 'sandbox';
    PLAID_SECRET = env.PLAID_SECRET;
  }

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
  return { plaidClient, environment: PLAID_ENV };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Handle CORS preflight
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  try {
    const body = await request.json();
    const { access_token, reason = 'user_requested' } = body || {};

    if (!access_token) {
      return jsonResponse({ error: 'Missing access_token' }, 400, env);
    }

    const { plaidClient, environment } = initializePlaidClient(env, access_token);

    console.log('🗑️ Removing Plaid item:', {
      access_token_length: access_token.length,
      environment: environment,
      reason,
      timestamp: new Date().toISOString()
    });

    // Get item info before removing (for logging)
    let itemInfo = null;
    try {
      const itemResponse = await plaidClient.itemGet({ access_token });
      itemInfo = {
        item_id: itemResponse.data.item.item_id,
        institution_id: itemResponse.data.item.institution_id,
        available_products: itemResponse.data.item.available_products,
        billed_products: itemResponse.data.item.billed_products
      };
      console.log('📋 Item details before removal:', itemInfo);
    } catch (error) {
      console.log('⚠️ Could not fetch item details (item may already be invalid)');
    }

    // Remove the item
    const removeRequest = {
      access_token: access_token
    };

    const removeResponse = await plaidClient.itemRemove(removeRequest);

    console.log('✅ Item removed successfully:', {
      removed: removeResponse.data.removed,
      request_id: removeResponse.data.request_id,
      item_id: itemInfo?.item_id || 'unknown',
      reason
    });

    return jsonResponse({
      success: true,
      removed: removeResponse.data.removed,
      request_id: removeResponse.data.request_id,
      item_id: itemInfo?.item_id,
      message: 'Account successfully disconnected and removed from Plaid',
      timestamp: new Date().toISOString()
    }, 200, env);

  } catch (error) {
    console.error('❌ Error removing Plaid item:', error);

    if (error.response) {
      // Plaid API error
      const plaidError = error.response.data;
      console.error('Plaid API Error:', plaidError);

      return jsonResponse({
        error: plaidError || 'Plaid API error',
        error_code: plaidError?.error_code,
        error_message: plaidError?.error_message,
        display_message: plaidError?.display_message
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