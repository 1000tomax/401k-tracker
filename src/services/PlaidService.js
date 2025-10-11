/**
 * Plaid API Service for 401K Tracker
 * Handles authentication, account linking, and transaction fetching
 */

class PlaidService {
  constructor() {
    this.baseURL = '/api/plaid';
    this.linkToken = null;
    this.accessToken = null;
    this.accountId = null;
    this.token = import.meta.env.VITE_401K_TOKEN || '';
  }

  /**
   * Get auth headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-401K-Token': this.token,
    };
  }

  /**
   * Create a link token for Plaid Link initialization
   */
  async createLinkToken(userId = 'default-user') {
    try {
      const response = await fetch(`${this.baseURL}/create_link_token`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          user_id: userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create link token: ${response.status}`);
      }

      const data = await response.json();
      this.linkToken = data.link_token;
      return data.link_token;
    } catch (error) {
      console.error('Error creating link token:', error);
      throw error;
    }
  }

  /**
   * Exchange public token for access token after successful Link
   */
  async exchangePublicToken(publicToken) {
    try {
      console.log('🔄 Exchanging public token:', {
        publicToken: publicToken?.substring(0, 20) + '...' || 'undefined',
        hasToken: !!publicToken,
        tokenType: typeof publicToken
      });

      const response = await fetch(`${this.baseURL}/exchange_public_token`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          public_token: publicToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to exchange token: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.accountId = data.item_id;
      
      return {
        access_token: data.access_token,
        item_id: data.item_id,
      };
    } catch (error) {
      console.error('Error exchanging public token:', error);
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getAccounts(accessToken = this.accessToken) {
    try {
      const response = await fetch(`${this.baseURL}/accounts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          access_token: accessToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get accounts: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting accounts:', error);
      throw error;
    }
  }

  /**
   * Get investment transactions
   */
  async getInvestmentTransactions(accessToken = this.accessToken, startDate = null, endDate = null) {
    try {
      // Default to last 90 days if no dates provided for more comprehensive debugging
      const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      console.log('🔍 PlaidService: Fetching investment transactions', {
        accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : 'none',
        dateRange: `${start} to ${end}`,
        url: `${this.baseURL}/investment_transactions`
      });

      const response = await fetch(`${this.baseURL}/investment_transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          access_token: accessToken,
          start_date: start,
          end_date: end,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ PlaidService: API Error', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Failed to get investment transactions: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      console.log('✅ PlaidService: Investment transactions response', {
        transactionCount: data.investment_transactions?.length || 0,
        securitiesCount: data.securities?.length || 0,
        accountsCount: data.accounts?.length || 0,
        totalTransactions: data.total_investment_transactions,
        dateRange: data.date_range
      });

      return data;
    } catch (error) {
      console.error('❌ PlaidService: Error getting investment transactions:', error);
      throw error;
    }
  }

  /**
   * Get regular transactions (for checking/savings accounts)
   */
  async getTransactions(accessToken = this.accessToken, startDate = null, endDate = null) {
    try {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      const response = await fetch(`${this.baseURL}/transactions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          access_token: accessToken,
          start_date: start,
          end_date: end,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get transactions: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }

  /**
   * Convert Plaid investment transactions to 401k-tracker format
   */
  convertPlaidToTrackerFormat(plaidTransactions) {
    console.log('🔄 PlaidService: Converting transactions to tracker format', {
      inputCount: plaidTransactions.length,
      sampleTransaction: plaidTransactions[0] || null
    });

    const converted = plaidTransactions.map(transaction => {
      const {
        investment_transaction_id,
        account_id,
        security_id,
        date,
        name,
        quantity,
        price,
        fees,
        type,
        amount,
        security_name,
        security_ticker,
        security_type,
        account_name,
        account_type,
        account_subtype
      } = transaction;

      // Map Plaid transaction types to our format
      const activity = this.mapPlaidTransactionType(type);

      // Use security name with ticker if available, fallback to name or security_id
      const fundName = security_ticker && security_name
        ? `${security_name} (${security_ticker})`
        : security_name || name || security_id;

      // Create a readable source/account name
      const moneySource = account_name || `${account_type || 'Investment'} Account`;

      return {
        date: date,
        fund: fundName,
        moneySource: moneySource,
        activity: activity,
        units: Math.abs(quantity || 0),
        unitPrice: price || 0,
        amount: Math.abs(amount || 0),
        // Keep additional metadata for reference
        plaidTransactionId: investment_transaction_id,
        accountId: account_id,
        securityId: security_id,
        fees: fees || 0,
        accountType: account_type,
        accountSubtype: account_subtype,
        securityType: security_type,
      };
    });

    console.log('✅ PlaidService: Conversion complete', {
      outputCount: converted.length,
      activityTypes: [...new Set(converted.map(t => t.activity))],
      dateRange: {
        earliest: Math.min(...converted.map(t => new Date(t.date).getTime())),
        latest: Math.max(...converted.map(t => new Date(t.date).getTime()))
      }
    });

    return converted;
  }

  /**
   * Map Plaid transaction types to our internal types
   */
  mapPlaidTransactionType(plaidType) {
    const typeMapping = {
      'buy': 'Buy',
      'sell': 'Sell',
      'dividend': 'Dividend',
      'fee': 'Fee',
      'transfer': 'Transfer',
      'deposit': 'Buy',  // Contributions often show as buy transactions
      'withdrawal': 'Sell',
      'cash': 'Dividend', // Cash dividends
      'cancel': 'Cancel',
    };

    return typeMapping[plaidType?.toLowerCase()] || 'Buy';
  }

  /**
   * Clear stored tokens (for logout/reset)
   */
  clearTokens() {
    this.linkToken = null;
    this.accessToken = null;
    this.accountId = null;
  }
}

export default new PlaidService();