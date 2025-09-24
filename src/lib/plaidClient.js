import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { classifyAccountType, detectAccountProvider } from '../src/utils/accountTypes.js';

const RETRY_DELAYS = [1000, 2000, 4000];

function getEnvironment() {
  const env = process.env.PLAID_ENV || 'sandbox';
  switch (env) {
    case 'sandbox':
      return PlaidEnvironments.sandbox;
    case 'development':
      return PlaidEnvironments.development;
    case 'production':
      return PlaidEnvironments.production;
    default:
      console.warn(`Unknown PLAID_ENV ${env}, defaulting to sandbox`);
      return PlaidEnvironments.sandbox;
  }
}

function ensureCredentials() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET environment variables are required');
  }
}

class ServerPlaidClient {
  constructor() {
    this.client = null;
  }

  ensureClient() {
    if (this.client) return;
    ensureCredentials();

    const configuration = new Configuration({
      basePath: getEnvironment(),
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  async withRetry(operation, label = 'plaid-operation') {
    this.ensureClient();
    let attempt = 0;
    let lastError;

    while (attempt <= RETRY_DELAYS.length) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === RETRY_DELAYS.length) break;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        attempt += 1;
        console.warn(`Retrying ${label}, attempt ${attempt + 1}`);
      }
    }

    throw lastError;
  }

  async createLinkToken({ userId = 'default_user', accountType = 'unknown' } = {}) {
    return this.withRetry(async () => {
      const request = {
        user: {
          client_user_id: userId,
        },
        client_name: '401K Tracker',
        products: ['investments'],
        country_codes: ['US'],
        language: 'en',
      };

      const response = await this.client.linkTokenCreate(request);
      return response.data;
    }, 'createLinkToken');
  }

  async exchangePublicToken(publicToken) {
    return this.withRetry(async () => {
      const response = await this.client.itemPublicTokenExchange({ public_token: publicToken });
      return response.data;
    }, 'exchangePublicToken');
  }

  async removeItem(accessToken) {
    return this.withRetry(async () => {
      const response = await this.client.itemRemove({ access_token: accessToken });
      return response.data;
    }, 'removeItem');
  }

  async getItemStatus(accessToken) {
    return this.withRetry(async () => {
      const response = await this.client.itemGet({ access_token: accessToken });
      return response.data;
    }, 'getItemStatus');
  }

  async getHoldings(accessToken) {
    return this.withRetry(async () => {
      const response = await this.client.investmentsHoldingsGet({ access_token: accessToken });
      return response.data;
    }, 'getHoldings');
  }

  async getAccounts(accessToken) {
    return this.withRetry(async () => {
      const response = await this.client.accountsGet({ access_token: accessToken });
      return response.data;
    }, 'getAccounts');
  }

  async getAllAccountData(accessToken) {
    const [accountsResponse, holdingsResponse] = await Promise.all([
      this.getAccounts(accessToken),
      this.getHoldings(accessToken)
    ]);

    const accountsMap = {};
    accountsResponse.accounts.forEach(account => {
      const classified = classifyAccountType(account);
      const provider = detectAccountProvider({ institution_name: holdingsResponse.item?.institution_name });

      accountsMap[account.account_id] = {
        ...account,
        accountType: classified,
        provider,
        institutionName: holdingsResponse.item?.institution_name,
        holdings: [],
        totalValue: account.balances?.current || 0
      };
    });

    const securitiesMap = {};
    holdingsResponse.securities.forEach(security => {
      securitiesMap[security.security_id] = security;
    });

    holdingsResponse.holdings.forEach(holding => {
      const security = securitiesMap[holding.security_id];
      const account = accountsMap[holding.account_id];
      if (!account) return;

      account.holdings.push({
        ...holding,
        security,
        symbol: security?.ticker_symbol,
        securityName: security?.name,
        institutionValue: holding.quantity * (holding.institution_price || 0)
      });
    });

    Object.values(accountsMap).forEach(account => {
      account.holdingsCount = account.holdings.length;
      account.calculatedValue = account.holdings.reduce((sum, holding) => sum + (holding.institutionValue || 0), 0);
    });

    return {
      accounts: accountsMap,
      holdings: holdingsResponse.holdings,
      securities: holdingsResponse.securities,
      item: holdingsResponse.item,
      summary: {
        accountCount: Object.keys(accountsMap).length,
        holdingsCount: holdingsResponse.holdings.length,
        securitiesCount: holdingsResponse.securities.length,
      },
      lastUpdated: new Date().toISOString()
    };
  }
}

export const plaidClient = new ServerPlaidClient();
export default plaidClient;
