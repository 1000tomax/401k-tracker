/**
 * @file transactionSync.js
 * @description Utility functions for transaction synchronization and deduplication.
 * Extracted from the sync worker for testability.
 */

/**
 * Generates a simple hash from a transaction's key fields for deduplication purposes.
 * This helps prevent importing the same transaction multiple times, even if
 * the plaid_transaction_id changes (e.g., after re-linking an account).
 *
 * @param {object} tx - The transaction object.
 * @param {string} tx.date - Transaction date (YYYY-MM-DD)
 * @param {number|string} tx.amount - Transaction amount
 * @param {string} tx.fund - Fund/ticker symbol
 * @param {string} tx.activity - Activity type (Purchased, Sold, etc.)
 * @returns {string} A short hexadecimal hash string.
 */
export function generateTransactionHash(tx) {
  const data = `${tx.date}|${tx.amount}|${tx.fund?.toLowerCase() || ''}|${tx.activity?.toLowerCase() || ''}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

/**
 * Generates a simple hash from a dividend's key fields for deduplication.
 *
 * @param {object} dividend - The dividend object.
 * @param {string} dividend.date - Dividend date (YYYY-MM-DD)
 * @param {string} dividend.fund - Fund/ticker symbol
 * @param {string} dividend.account - Account name
 * @param {number|string} dividend.amount - Dividend amount
 * @returns {string} A short hexadecimal hash string.
 */
export function generateDividendHash(dividend) {
  const data = `${dividend.date}|${dividend.fund?.toLowerCase() || ''}|${dividend.account?.toLowerCase() || ''}|${dividend.amount}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

/**
 * Determines whether a transaction should be imported into the main transactions table.
 * Contains business logic for filtering based on account type and transaction type.
 *
 * Rules:
 * - Roth IRA accounts: Only import VTI, DES, SCHD, QQQM buy/sell transactions
 * - Roth IRA accounts: Exclude dividends, cash transfers, and zero-share transactions
 * - Non-Roth accounts (401k, etc.): Import all transactions
 *
 * @param {object} transaction - The transaction object in the application's standard format.
 * @param {string} transaction.fund - Fund/ticker symbol
 * @param {string} transaction.activity - Activity type
 * @param {number} transaction.units - Number of shares
 * @param {string} accountName - The name of the account the transaction belongs to.
 * @returns {boolean} `true` if the transaction should be imported, `false` otherwise.
 */
export function shouldImportTransaction(transaction, accountName) {
  // Match Roth IRA accounts
  const lowerName = (accountName || '').toLowerCase();
  const isRothIRA = lowerName.includes('roth') && lowerName.includes('ira');

  if (isRothIRA) {
    // Roth IRA: Only import specific symbols
    const allowedSymbols = ['VTI', 'DES', 'SCHD', 'QQQM'];
    const symbol = (transaction.fund || '').toUpperCase().trim();

    if (!allowedSymbols.includes(symbol)) {
      return false;
    }

    // Only buy/sell transactions
    const activity = (transaction.activity || '').toUpperCase();
    const isAllowedType = ['PURCHASED', 'SOLD', 'BUY', 'SELL'].some(type =>
      activity.includes(type)
    );

    if (!isAllowedType) {
      return false;
    }

    // Ignore dividends
    if (/dividend/i.test(transaction.activity || '')) {
      return false;
    }

    // Ignore cash transfers
    const isCashTransfer = /transfer|deposit|ach|cash/i.test(transaction.activity || '');
    const hasNoShares = !transaction.units || Math.abs(transaction.units) < 0.0001;
    if (isCashTransfer || hasNoShares) {
      return false;
    }
  }

  // For non-Roth accounts (401k, etc.), import all
  return true;
}

/**
 * Filters out duplicate transactions based on plaid_transaction_id AND transaction_hash.
 * This handles both normal duplicates and re-link scenarios where Plaid generates new IDs
 * for the same underlying transactions.
 *
 * @param {Array<object>} newTransactions - Transactions to potentially import
 * @param {Set<string>} existingPlaidIds - Set of existing plaid_transaction_ids in DB
 * @param {Set<string>} existingHashes - Set of existing transaction_hashes in DB
 * @returns {object} Object with { toImport: Array, duplicateCount: number }
 */
export function filterDuplicateTransactions(newTransactions, existingPlaidIds, existingHashes) {
  const toImport = [];
  let duplicateCount = 0;

  for (const tx of newTransactions) {
    const isDuplicateById = existingPlaidIds.has(tx.plaid_transaction_id);
    const isDuplicateByHash = existingHashes.has(tx.transaction_hash);

    if (isDuplicateById || isDuplicateByHash) {
      duplicateCount++;
    } else {
      toImport.push(tx);
    }
  }

  return { toImport, duplicateCount };
}

/**
 * Filters out duplicate dividends based on plaid_transaction_id AND dividend_hash.
 *
 * @param {Array<object>} newDividends - Dividends to potentially import
 * @param {Set<string>} existingPlaidIds - Set of existing plaid_transaction_ids in DB
 * @param {Set<string>} existingHashes - Set of existing dividend_hashes in DB
 * @returns {object} Object with { toImport: Array, duplicateCount: number }
 */
export function filterDuplicateDividends(newDividends, existingPlaidIds, existingHashes) {
  const toImport = [];
  let duplicateCount = 0;

  for (const div of newDividends) {
    const isDuplicateById = existingPlaidIds.has(div.plaid_transaction_id);
    const isDuplicateByHash = existingHashes.has(div.dividend_hash);

    if (isDuplicateById || isDuplicateByHash) {
      duplicateCount++;
    } else {
      toImport.push(div);
    }
  }

  return { toImport, duplicateCount };
}
