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
  }

  /**
   * Create a link token for Plaid Link initialization
   */
  async createLinkToken(userId = 'default-user') {
    try {
      const response = await fetch(`${this.baseURL}/createLinkToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch(`${this.baseURL}/exchangeToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        headers: {
          'Content-Type': 'application/json',
        },
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
      // Default to last 30 days if no dates provided
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      const response = await fetch(`${this.baseURL}/investmentTransactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          start_date: start,
          end_date: end,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get investment transactions: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting investment transactions:', error);
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
        headers: {
          'Content-Type': 'application/json',
        },
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
    return plaidTransactions.map(transaction => {
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