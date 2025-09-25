/**
 * Mock Plaid Service for development and testing
 * Provides realistic sample data to test the debugging interface
 */

export const mockPlaidData = {
  investment_transactions: [
    {
      investment_transaction_id: 'mock_txn_001',
      account_id: 'mock_acc_001',
      security_id: 'mock_sec_001',
      date: '2024-09-20',
      name: 'BUY',
      quantity: 100.5,
      price: 125.75,
      fees: 2.50,
      type: 'buy',
      amount: 12640.38,
      security_name: 'Vanguard Total Stock Market Index Fund',
      security_ticker: 'VTSAX',
      security_type: 'mutual fund',
      account_name: 'Voya 401k Plan',
      account_type: 'investment',
      account_subtype: '401k'
    },
    {
      investment_transaction_id: 'mock_txn_002',
      account_id: 'mock_acc_001',
      security_id: 'mock_sec_002',
      date: '2024-09-15',
      name: 'DIVIDEND',
      quantity: 0,
      price: 0,
      fees: 0,
      type: 'dividend',
      amount: 45.32,
      security_name: 'Vanguard International Stock Index Fund',
      security_ticker: 'VTIAX',
      security_type: 'mutual fund',
      account_name: 'Voya 401k Plan',
      account_type: 'investment',
      account_subtype: '401k'
    },
    {
      investment_transaction_id: 'mock_txn_003',
      account_id: 'mock_acc_001',
      security_id: 'mock_sec_003',
      date: '2024-09-10',
      name: 'BUY',
      quantity: 75.25,
      price: 89.50,
      fees: 1.75,
      type: 'buy',
      amount: 6736.13,
      security_name: 'Vanguard Bond Index Fund',
      security_ticker: 'VBTLX',
      security_type: 'mutual fund',
      account_name: 'Voya 401k Plan',
      account_type: 'investment',
      account_subtype: '401k'
    },
    {
      investment_transaction_id: 'mock_txn_004',
      account_id: 'mock_acc_002',
      security_id: 'mock_sec_004',
      date: '2024-09-05',
      name: 'CONTRIBUTION',
      quantity: 50.0,
      price: 215.30,
      fees: 0,
      type: 'buy',
      amount: 10765.00,
      security_name: 'Fidelity 500 Index Fund',
      security_ticker: 'FXAIX',
      security_type: 'mutual fund',
      account_name: 'Fidelity 401k',
      account_type: 'investment',
      account_subtype: '401k'
    },
    {
      investment_transaction_id: 'mock_txn_005',
      account_id: 'mock_acc_001',
      security_id: 'mock_sec_001',
      date: '2024-08-30',
      name: 'REBALANCE_SELL',
      quantity: -25.0,
      price: 123.45,
      fees: 0,
      type: 'sell',
      amount: 3086.25,
      security_name: 'Vanguard Total Stock Market Index Fund',
      security_ticker: 'VTSAX',
      security_type: 'mutual fund',
      account_name: 'Voya 401k Plan',
      account_type: 'investment',
      account_subtype: '401k'
    }
  ],
  securities: [
    {
      security_id: 'mock_sec_001',
      name: 'Vanguard Total Stock Market Index Fund',
      ticker_symbol: 'VTSAX',
      type: 'mutual fund',
      close_price: 125.75,
      close_price_as_of: '2024-09-20',
      isin: 'US9229087690',
      sedol: null,
      cusip: '922908769'
    },
    {
      security_id: 'mock_sec_002',
      name: 'Vanguard International Stock Index Fund',
      ticker_symbol: 'VTIAX',
      type: 'mutual fund',
      close_price: 67.89,
      close_price_as_of: '2024-09-20',
      isin: 'US9229086957',
      sedol: null,
      cusip: '922908695'
    },
    {
      security_id: 'mock_sec_003',
      name: 'Vanguard Bond Index Fund',
      ticker_symbol: 'VBTLX',
      type: 'mutual fund',
      close_price: 89.50,
      close_price_as_of: '2024-09-20',
      isin: 'US9229085506',
      sedol: null,
      cusip: '922908550'
    },
    {
      security_id: 'mock_sec_004',
      name: 'Fidelity 500 Index Fund',
      ticker_symbol: 'FXAIX',
      type: 'mutual fund',
      close_price: 215.30,
      close_price_as_of: '2024-09-20',
      isin: 'US31635H7462',
      sedol: null,
      cusip: '31635H746'
    }
  ],
  accounts: [
    {
      account_id: 'mock_acc_001',
      name: 'Voya 401k Plan',
      type: 'investment',
      subtype: '401k',
      balances: {
        available: null,
        current: 125450.67,
        limit: null,
        iso_currency_code: 'USD',
        unofficial_currency_code: null
      }
    },
    {
      account_id: 'mock_acc_002',
      name: 'Fidelity 401k',
      type: 'investment',
      subtype: '401k',
      balances: {
        available: null,
        current: 45230.12,
        limit: null,
        iso_currency_code: 'USD',
        unofficial_currency_code: null
      }
    }
  ],
  total_investment_transactions: 5,
  date_range: {
    start_date: '2024-08-24',
    end_date: '2024-09-24'
  }
};

export const mockConnectionData = {
  accessToken: 'access-sandbox-mock-token-12345',
  itemId: 'mock-item-id-67890',
  accounts: mockPlaidData.accounts,
  institution: {
    name: 'Mock Investment Bank (Dev)',
    institution_id: 'mock_institution_001'
  },
  linkSessionId: 'mock-link-session-12345'
};

/**
 * Mock PlaidService that returns sample data for development
 */
class MockPlaidService {
  constructor() {
    this.baseURL = '/api/plaid';
    this.linkToken = null;
    this.accessToken = null;
    this.accountId = null;
    this.isMockMode = true;
  }

  async createLinkToken(userId = 'mock-user') {
    console.log('🎭 MockPlaidService: Creating mock link token');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockToken = `link-sandbox-mock-${Date.now()}`;
    this.linkToken = mockToken;
    return mockToken;
  }

  async exchangePublicToken(publicToken) {
    console.log('🎭 MockPlaidService: Exchanging mock public token');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const mockData = {
      access_token: 'access-sandbox-mock-token-12345',
      item_id: 'mock-item-id-67890'
    };

    this.accessToken = mockData.access_token;
    this.accountId = mockData.item_id;

    return mockData;
  }

  async getAccounts(accessToken = this.accessToken) {
    console.log('🎭 MockPlaidService: Getting mock accounts');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      accounts: mockPlaidData.accounts,
      item: {
        item_id: this.accountId,
        available_products: ['investments'],
        billed_products: ['investments']
      },
      request_id: 'mock-request-accounts-123'
    };
  }

  async getInvestmentTransactions(accessToken = this.accessToken, startDate = null, endDate = null) {
    console.log('🎭 MockPlaidService: Getting mock investment transactions');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1200));

    return mockPlaidData;
  }

  convertPlaidToTrackerFormat(plaidTransactions) {
    console.log('🎭 MockPlaidService: Converting mock transactions to tracker format', {
      inputCount: plaidTransactions.length
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

      // Use security name with ticker if available
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

    console.log('✅ MockPlaidService: Mock conversion complete', {
      outputCount: converted.length,
      activityTypes: [...new Set(converted.map(t => t.activity))]
    });

    return converted;
  }

  mapPlaidTransactionType(plaidType) {
    const typeMapping = {
      'buy': 'Buy',
      'sell': 'Sell',
      'dividend': 'Dividend',
      'fee': 'Fee',
      'transfer': 'Transfer',
      'deposit': 'Buy',
      'withdrawal': 'Sell',
      'cash': 'Dividend',
      'cancel': 'Cancel',
    };

    return typeMapping[plaidType?.toLowerCase()] || 'Buy';
  }

  clearTokens() {
    this.linkToken = null;
    this.accessToken = null;
    this.accountId = null;
  }
}

export default new MockPlaidService();