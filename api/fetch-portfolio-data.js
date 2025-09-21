import { allowCorsAndAuth, requireSharedToken } from '../src/utils/cors.js';
import plaidClient from './_lib/plaidClient.js';
import { getAllStoredTokens } from './_lib/plaidTokens.js';

const REQUIRED_ENV = ['PLAID_CLIENT_ID', 'PLAID_SECRET'];

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function validateEnv() {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function gatherAccessTokens(req, providedTokens = {}) {
  const tokens = {};

  try {
    const stored = getAllStoredTokens(req);
    stored.forEach(entry => {
      if (entry?.accountType && entry?.accessToken) {
        tokens[entry.accountType] = entry.accessToken;
      }
    });
  } catch (error) {
    console.warn('Unable to read stored Plaid tokens:', error);
  }

  Object.entries(providedTokens).forEach(([accountType, token]) => {
    if (typeof token === 'string' && token.trim()) {
      tokens[accountType] = token.trim();
    }
  });

  return tokens;
}

async function fetchAllAccountData(accessTokens) {
  const results = {};
  const errors = {};

  for (const [accountType, accessToken] of Object.entries(accessTokens)) {
    try {
      const data = await plaidClient.getAllAccountData(accessToken);
      const totalValue = Object.values(data.accounts || {}).reduce((sum, account) => {
        const value = account.calculatedValue ?? account.totalValue ?? account.balances?.current ?? 0;
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      results[accountType] = {
        ...data,
        totalValue,
        accountType
      };
    } catch (error) {
      console.error(`Failed to fetch data for ${accountType}:`, error);
      const plaidError = error?.response?.data;
      errors[accountType] = {
        error: plaidError?.display_message || error.message || 'Failed to fetch account data',
        error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
        error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
        request_id: plaidError?.request_id,
        timestamp: new Date().toISOString()
      };
    }
  }

  return { results, errors };
}

function formatForGitHubSync(portfolioData, existingData = null) {
  const timestamp = new Date().toISOString();

  const enhancedData = {
    version: '2.0',
    ...(existingData || {}),
    apiData: {
      plaidAccounts: portfolioData.results,
      errors: portfolioData.errors,
      lastAPISync: timestamp,
      syncSource: 'automated'
    },
    dataSource: existingData ? 'hybrid' : 'api',
    lastUpdated: timestamp
  };

  if (existingData && existingData.totals && Object.keys(portfolioData.results).length > 0) {
    const apiTotalValue = Object.values(portfolioData.results).reduce((sum, account) => sum + (account.totalValue || 0), 0);

    enhancedData.combinedTotals = {
      manualValue: existingData.totals.marketValue || 0,
      apiValue: apiTotalValue,
      totalValue: (existingData.totals.marketValue || 0) + apiTotalValue,
      lastCalculated: timestamp
    };
  }

  return enhancedData;
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { ok: false, error: 'Use POST for this endpoint.' });
    return;
  }

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    send(res, auth.status, { ok: false, error: auth.message });
    return;
  }

  try {
    validateEnv();

    const {
      access_tokens = {},
      include_live_prices = false,
      existing_data = null,
      format_for_github = true
    } = req.body || {};

    const accessTokens = gatherAccessTokens(req, access_tokens);

    if (Object.keys(accessTokens).length === 0) {
      send(res, 400, {
        ok: false,
        error: 'No access tokens available. Connect an account first.',
        hint: 'Use /api/plaid/exchange-token to store access tokens, or provide access_tokens in the request body.'
      });
      return;
    }

    const portfolioData = await fetchAllAccountData(accessTokens);

    let responseData = portfolioData;
    if (format_for_github) {
      responseData = formatForGitHubSync(portfolioData, existing_data);
    }

    const successCount = Object.keys(portfolioData.results).length;
    const errorCount = Object.keys(portfolioData.errors).length;

    send(res, 200, {
      ok: true,
      data: responseData,
      summary: {
        accounts_fetched: successCount,
        accounts_failed: errorCount,
        total_accounts: successCount + errorCount,
        include_live_prices,
        live_price_status: include_live_prices ? 'not_available_in_api_response' : 'skipped',
        timestamp: new Date().toISOString()
      },
      errors: portfolioData.errors
    });
  } catch (error) {
    console.error('Failed to fetch portfolio data:', error);

    const plaidError = error?.response?.data;
    const status = error?.response?.status || 500;

    send(res, status, {
      ok: false,
      error: plaidError?.display_message || error.message || 'Failed to fetch portfolio data',
      error_code: plaidError?.error_code || 'UNKNOWN_ERROR',
      error_type: plaidError?.error_type || 'UNKNOWN_TYPE',
      request_id: plaidError?.request_id,
      rawError: error.message
    });
  }
}
