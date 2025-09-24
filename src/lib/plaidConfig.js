/**
 * Plaid API configuration
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Lazy initialization to avoid loading during Vite config phase
let plaidClient = null;
let config = null;

function initializePlaidClient() {
  if (plaidClient) return { plaidClient, config };

  // Environment variables
  const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
  const PLAID_SECRET = process.env.PLAID_SECRET;
  const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error('Missing Plaid credentials. Please check your environment variables.');
  }

  // Initialize the Plaid client
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

  plaidClient = new PlaidApi(configuration);

  config = {
    PLAID_CLIENT_ID,
    PLAID_SECRET,
    PLAID_ENV,
    PLAID_PRODUCTS: (process.env.PLAID_PRODUCTS || 'auth,transactions,investments').split(','),
    PLAID_COUNTRY_CODES: (process.env.PLAID_COUNTRY_CODES || 'US').split(','),
  };

  return { plaidClient, config };
}

export { initializePlaidClient };