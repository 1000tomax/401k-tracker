// Demo data for portfolio showcase
import { ACCOUNT_TYPES, ACCOUNT_PROVIDERS } from './accountTypes.js';

export function generateDemoData() {
  const demoTransactions = [
    // 2023 Data - Start of tracking
    {
      date: '2023-01-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 500.00,
      units: 45.45,
      shares: 45.45,
      unitPrice: 11.00,
      balance: 500.00,
      accountType: ACCOUNT_TYPES.TRADITIONAL_401K,
      accountId: 'voya_401k_001',
      provider: ACCOUNT_PROVIDERS.VOYA
    },
    {
      date: '2023-01-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 250.00,
      units: 22.73,
      shares: 22.73,
      unitPrice: 11.00,
      balance: 750.00
    },
    {
      date: '2023-01-31',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 500.00,
      units: 43.48,
      shares: 43.48,
      unitPrice: 11.50,
      balance: 1250.00
    },
    {
      date: '2023-01-31',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 250.00,
      units: 21.74,
      shares: 21.74,
      unitPrice: 11.50,
      balance: 1500.00
    },

    // Q2 2023 - Adding bond diversification
    {
      date: '2023-04-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 400.00,
      units: 32.26,
      shares: 32.26,
      unitPrice: 12.40,
      balance: 1900.00
    },
    {
      date: '2023-04-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 100.00,
      units: 9.09,
      shares: 9.09,
      unitPrice: 11.00,
      balance: 100.00
    },
    {
      date: '2023-04-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 250.00,
      units: 20.16,
      shares: 20.16,
      unitPrice: 12.40,
      balance: 2150.00
    },

    // Q3 2023 - Market gains
    {
      date: '2023-07-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 400.00,
      units: 29.85,
      shares: 29.85,
      unitPrice: 13.40,
      balance: 2550.00
    },
    {
      date: '2023-07-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 100.00,
      units: 9.26,
      shares: 9.26,
      unitPrice: 10.80,
      balance: 200.00
    },
    {
      date: '2023-07-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 250.00,
      units: 18.66,
      shares: 18.66,
      unitPrice: 13.40,
      balance: 2800.00
    },

    // Q4 2023 - Adding international exposure
    {
      date: '2023-10-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 300.00,
      units: 21.74,
      shares: 21.74,
      unitPrice: 13.80,
      balance: 3100.00
    },
    {
      date: '2023-10-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 100.00,
      units: 9.62,
      shares: 9.62,
      unitPrice: 10.40,
      balance: 300.00
    },
    {
      date: '2023-10-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total International Stock Index',
      source: 'Voya 401k',
      amount: 100.00,
      units: 11.11,
      shares: 11.11,
      unitPrice: 9.00,
      balance: 100.00
    },
    {
      date: '2023-10-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 250.00,
      units: 18.12,
      shares: 18.12,
      unitPrice: 13.80,
      balance: 3350.00
    },

    // 2024 Data - Increased contributions
    {
      date: '2024-01-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 600.00,
      units: 40.54,
      shares: 40.54,
      unitPrice: 14.80,
      balance: 3950.00
    },
    {
      date: '2024-01-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 14.71,
      shares: 14.71,
      unitPrice: 10.20,
      balance: 450.00
    },
    {
      date: '2024-01-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total International Stock Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 15.79,
      shares: 15.79,
      unitPrice: 9.50,
      balance: 250.00
    },
    {
      date: '2024-01-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 450.00,
      units: 30.41,
      shares: 30.41,
      unitPrice: 14.80,
      balance: 4400.00
    },

    // Q2 2024 - Market volatility
    {
      date: '2024-04-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 600.00,
      units: 42.86,
      shares: 42.86,
      unitPrice: 14.00,
      balance: 5000.00
    },
    {
      date: '2024-04-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 14.29,
      shares: 14.29,
      unitPrice: 10.50,
      balance: 600.00
    },
    {
      date: '2024-04-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total International Stock Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 16.67,
      shares: 16.67,
      unitPrice: 9.00,
      balance: 400.00
    },
    {
      date: '2024-04-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 450.00,
      units: 32.14,
      shares: 32.14,
      unitPrice: 14.00,
      balance: 5450.00
    },

    // Q3 2024 - Strong market performance with most recent prices
    {
      date: '2024-07-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 600.00,
      units: 30.77,
      shares: 30.77,
      unitPrice: 19.50, // Current market price showing strong growth
      balance: 6050.00
    },
    {
      date: '2024-07-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total Bond Market Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 12.71,
      shares: 12.71,
      unitPrice: 11.80, // Bond price improvement
      balance: 750.00
    },
    {
      date: '2024-07-15',
      activity: 'Employee Contribution',
      fund: 'Vanguard Total International Stock Index',
      source: 'Voya 401k',
      amount: 150.00,
      units: 13.33,
      shares: 13.33,
      unitPrice: 11.25, // International growth
      balance: 550.00
    },
    {
      date: '2024-07-15',
      activity: 'Company Match',
      fund: 'Vanguard Total Stock Market Index',
      source: 'Voya 401k',
      amount: 450.00,
      units: 23.08,
      shares: 23.08,
      unitPrice: 19.50,
      balance: 6500.00
    },

    // M1 Finance Roth IRA contributions with current ETF prices
    {
      date: '2024-08-01',
      activity: 'Investment',
      fund: 'SPDR S&P 500 ETF',
      source: 'M1 Finance',
      amount: 1000.00,
      units: 16.00,
      shares: 16.00,
      unitPrice: 62.50, // Current ETF price
      balance: 1000.00,
      accountType: ACCOUNT_TYPES.ROTH_IRA,
      accountId: 'm1_roth_ira_001',
      provider: ACCOUNT_PROVIDERS.M1,
      symbol: 'SPY'
    },
    {
      date: '2024-08-15',
      activity: 'Investment',
      fund: 'SPDR S&P 500 ETF',
      source: 'M1 Finance',
      amount: 500.00,
      units: 8.00,
      shares: 8.00,
      unitPrice: 62.50,
      balance: 1500.00,
      accountType: ACCOUNT_TYPES.ROTH_IRA,
      accountId: 'm1_roth_ira_001',
      provider: ACCOUNT_PROVIDERS.M1,
      symbol: 'SPY'
    },
    {
      date: '2024-09-01',
      activity: 'Investment',
      fund: 'iShares Core MSCI Total International Stock ETF',
      source: 'M1 Finance',
      amount: 300.00,
      units: 4.17,
      shares: 4.17,
      unitPrice: 72.00, // Current international ETF price
      balance: 300.00,
      accountType: ACCOUNT_TYPES.ROTH_IRA,
      accountId: 'm1_roth_ira_001',
      provider: ACCOUNT_PROVIDERS.M1,
      symbol: 'IXUS'
    },
    {
      date: '2024-10-01',
      activity: 'Investment',
      fund: 'SPDR S&P 500 ETF',
      source: 'M1 Finance',
      amount: 500.00,
      units: 8.00,
      shares: 8.00,
      unitPrice: 62.50,
      balance: 2000.00,
      accountType: ACCOUNT_TYPES.ROTH_IRA,
      accountId: 'm1_roth_ira_001',
      provider: ACCOUNT_PROVIDERS.M1,
      symbol: 'SPY'
    }
  ];

  return {
    version: 1,
    transactions: demoTransactions,
    lastSyncAt: new Date().toISOString()
  };
}

export function getDemoSettings() {
  return {
    multiAccountMode: false, // Temporarily disable to avoid schema issues
    defaultView: 'consolidated',
    userAge: '28',
    autoRefreshPrices: true
  };
}