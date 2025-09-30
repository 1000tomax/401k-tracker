/**
 * Account Configuration
 * Defines transaction import rules for each account type
 */

/**
 * Account-specific transaction import rules
 */
export const ACCOUNT_IMPORT_RULES = {
  roth_ira: {
    // Only import these 4 current holdings
    allowedSymbols: ['VTI', 'DES', 'SCHD', 'QQQM'],

    // Only import share buy/sell transactions
    allowedTransactionTypes: ['PURCHASED', 'SOLD', 'BUY', 'SELL'],

    // Ignore dividends (captured in subsequent purchases)
    ignoreDividends: true,

    // Ignore cash transfers/deposits (captured in purchases)
    ignoreCashTransfers: true,
  },

  voya_401k: {
    // No filtering - manually imported transactions
    allowedSymbols: null,
    allowedTransactionTypes: null,
    ignoreDividends: false,
    ignoreCashTransfers: false,
  },
};

/**
 * Get import rules for an account
 * @param {string} accountId - Account ID
 * @param {string} accountName - Account name
 * @returns {object} Account rules
 */
export function getAccountRules(accountId, accountName) {
  // Try exact match first
  if (ACCOUNT_IMPORT_RULES[accountId]) {
    return ACCOUNT_IMPORT_RULES[accountId];
  }

  // Match by name pattern
  const lowerName = (accountName || '').toLowerCase();

  if (lowerName.includes('roth') && lowerName.includes('ira')) {
    return ACCOUNT_IMPORT_RULES.roth_ira;
  }

  if (lowerName.includes('401') || lowerName.includes('voya')) {
    return ACCOUNT_IMPORT_RULES.voya_401k;
  }

  // Default: no filtering
  return {
    allowedSymbols: null,
    allowedTransactionTypes: null,
    ignoreDividends: false,
    ignoreCashTransfers: false,
  };
}

/**
 * Check if a transaction should be imported based on account rules
 * @param {object} transaction - Transaction object
 * @param {string} accountId - Account ID
 * @param {string} accountName - Account name
 * @returns {boolean} True if transaction should be imported
 */
export function shouldImportTransaction(transaction, accountId, accountName) {
  const rules = getAccountRules(accountId, accountName);

  // 1. Filter by symbol
  if (rules.allowedSymbols) {
    const symbol = (transaction.fund || '').toUpperCase().trim();
    if (!rules.allowedSymbols.includes(symbol)) {
      console.log(`⏭️  Skipping ${symbol} - not in allowlist`);
      return false;
    }
  }

  // 2. Filter by transaction type
  if (rules.allowedTransactionTypes) {
    const activity = (transaction.activity || '').toUpperCase();
    const isAllowedType = rules.allowedTransactionTypes.some(type =>
      activity.includes(type)
    );
    if (!isAllowedType) {
      console.log(`⏭️  Skipping ${transaction.fund} ${activity} - not allowed type`);
      return false;
    }
  }

  // 3. Filter dividends
  if (rules.ignoreDividends) {
    const isDividend = /dividend/i.test(transaction.activity || '');
    if (isDividend) {
      console.log(`⏭️  Skipping dividend - ${transaction.fund}`);
      return false;
    }
  }

  // 4. Filter cash transfers
  if (rules.ignoreCashTransfers) {
    const isCashTransfer = /transfer|deposit|ach|cash/i.test(transaction.activity || '');
    const hasNoShares = !transaction.units || Math.abs(transaction.units) < 0.0001;

    if (isCashTransfer || hasNoShares) {
      console.log(`⏭️  Skipping cash/transfer - no shares`);
      return false;
    }
  }

  return true;
}
