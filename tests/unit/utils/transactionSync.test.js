import { describe, it, expect } from 'vitest';
import {
  generateTransactionHash,
  generateDividendHash,
  shouldImportTransaction,
  filterDuplicateTransactions,
  filterDuplicateDividends,
} from '../../../src/utils/transactionSync.js';

// ============================================================================
// Sample Data - Mimics real Plaid transaction data
// ============================================================================

const sampleTransactions = {
  // Original transaction from first Plaid link
  vtiNov20Original: {
    date: '2025-11-20',
    fund: 'VTI',
    amount: 27.74,
    activity: 'Purchased',
    units: 0.08395,
    plaid_transaction_id: 'mMMvjeRxvouJRvEbpAMRhnBaV6rLLnCZMrMv3',
  },
  // Same transaction after re-linking Plaid (new ID, same content)
  vtiNov20Relinked: {
    date: '2025-11-20',
    fund: 'VTI',
    amount: 27.74,
    activity: 'Purchased',
    units: 0.08395,
    plaid_transaction_id: 'X40MPBKYpVFvyLXxvnpdHn9k9K710xCzJEKyb', // Different ID!
  },
  // Genuinely different transaction
  vtiNov21New: {
    date: '2025-11-21',
    fund: 'VTI',
    amount: 35.50,
    activity: 'Purchased',
    units: 0.10500,
    plaid_transaction_id: 'NEW123456789',
  },
  // SCHD transaction
  schdNov20: {
    date: '2025-11-20',
    fund: 'SCHD',
    amount: 2.65,
    activity: 'Purchased',
    units: 0.09801,
    plaid_transaction_id: 'dZZ1yeXK1RfMpDP4NAzpcgoDvBPLLgC4b0bQ8',
  },
  // Dividend transaction (should be filtered for Roth IRA)
  vtiDividend: {
    date: '2025-11-15',
    fund: 'VTI',
    amount: 1.25,
    activity: 'Dividend',
    units: 0,
    plaid_transaction_id: 'DIV123456789',
  },
  // Non-allowed symbol for Roth IRA
  spyTransaction: {
    date: '2025-11-20',
    fund: 'SPY',
    amount: 100.00,
    activity: 'Purchased',
    units: 0.5,
    plaid_transaction_id: 'SPY123456789',
  },
  // Cash transfer (should be filtered)
  cashTransfer: {
    date: '2025-11-20',
    fund: 'VTI',
    amount: 50.00,
    activity: 'Transfer',
    units: 0,
    plaid_transaction_id: 'TRANSFER123',
  },
};

const sampleDividends = {
  vtiDivOriginal: {
    date: '2025-11-15',
    fund: 'VTI',
    account: 'Roth IRA',
    amount: 1.25,
    plaid_transaction_id: 'DIV_ORIG_123',
  },
  vtiDivRelinked: {
    date: '2025-11-15',
    fund: 'VTI',
    account: 'Roth IRA',
    amount: 1.25,
    plaid_transaction_id: 'DIV_NEW_456', // Different ID after re-link
  },
  schdDivNew: {
    date: '2025-11-20',
    fund: 'SCHD',
    account: 'Roth IRA',
    amount: 0.85,
    plaid_transaction_id: 'DIV_SCHD_789',
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('generateTransactionHash', () => {
  it('should generate consistent hash for same transaction data', () => {
    const hash1 = generateTransactionHash(sampleTransactions.vtiNov20Original);
    const hash2 = generateTransactionHash(sampleTransactions.vtiNov20Original);

    expect(hash1).toBe(hash2);
  });

  it('should generate same hash for transactions with different plaid_transaction_id but same content', () => {
    // This is the key test - re-linked accounts get new IDs but same content
    const originalHash = generateTransactionHash(sampleTransactions.vtiNov20Original);
    const relinkedHash = generateTransactionHash(sampleTransactions.vtiNov20Relinked);

    expect(originalHash).toBe(relinkedHash);
  });

  it('should generate different hash for different transactions', () => {
    const hash1 = generateTransactionHash(sampleTransactions.vtiNov20Original);
    const hash2 = generateTransactionHash(sampleTransactions.vtiNov21New);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different funds on same date', () => {
    const vtiHash = generateTransactionHash(sampleTransactions.vtiNov20Original);
    const schdHash = generateTransactionHash(sampleTransactions.schdNov20);

    expect(vtiHash).not.toBe(schdHash);
  });

  it('should handle missing fields gracefully', () => {
    const hash = generateTransactionHash({ date: '2025-11-20', amount: 10 });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should be case-insensitive for fund and activity', () => {
    const hash1 = generateTransactionHash({
      date: '2025-11-20',
      fund: 'VTI',
      amount: 27.74,
      activity: 'Purchased',
    });
    const hash2 = generateTransactionHash({
      date: '2025-11-20',
      fund: 'vti',
      amount: 27.74,
      activity: 'purchased',
    });

    expect(hash1).toBe(hash2);
  });
});

describe('generateDividendHash', () => {
  it('should generate consistent hash for same dividend data', () => {
    const hash1 = generateDividendHash(sampleDividends.vtiDivOriginal);
    const hash2 = generateDividendHash(sampleDividends.vtiDivOriginal);

    expect(hash1).toBe(hash2);
  });

  it('should generate same hash for dividends with different plaid_transaction_id but same content', () => {
    const originalHash = generateDividendHash(sampleDividends.vtiDivOriginal);
    const relinkedHash = generateDividendHash(sampleDividends.vtiDivRelinked);

    expect(originalHash).toBe(relinkedHash);
  });

  it('should generate different hash for different dividends', () => {
    const hash1 = generateDividendHash(sampleDividends.vtiDivOriginal);
    const hash2 = generateDividendHash(sampleDividends.schdDivNew);

    expect(hash1).not.toBe(hash2);
  });
});

describe('shouldImportTransaction', () => {
  describe('Roth IRA account filtering', () => {
    const rothIraAccount = 'She Roth on that thing til i IRA';

    it('should import allowed symbols (VTI, DES, SCHD, QQQM) for Roth IRA', () => {
      expect(shouldImportTransaction(sampleTransactions.vtiNov20Original, rothIraAccount)).toBe(true);
      expect(shouldImportTransaction(sampleTransactions.schdNov20, rothIraAccount)).toBe(true);
    });

    it('should reject non-allowed symbols for Roth IRA', () => {
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, rothIraAccount)).toBe(false);
    });

    it('should reject dividend transactions for Roth IRA', () => {
      expect(shouldImportTransaction(sampleTransactions.vtiDividend, rothIraAccount)).toBe(false);
    });

    it('should reject cash transfers for Roth IRA', () => {
      expect(shouldImportTransaction(sampleTransactions.cashTransfer, rothIraAccount)).toBe(false);
    });

    it('should reject zero-share transactions for Roth IRA', () => {
      const zeroShareTx = { ...sampleTransactions.vtiNov20Original, units: 0 };
      expect(shouldImportTransaction(zeroShareTx, rothIraAccount)).toBe(false);
    });
  });

  describe('Non-Roth account (401k)', () => {
    const voyaAccount = 'Voya 401(k)';

    it('should import all transactions for 401k accounts', () => {
      expect(shouldImportTransaction(sampleTransactions.vtiNov20Original, voyaAccount)).toBe(true);
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, voyaAccount)).toBe(true);
      expect(shouldImportTransaction(sampleTransactions.vtiDividend, voyaAccount)).toBe(true);
    });
  });

  describe('Account name variations', () => {
    it('should detect Roth IRA regardless of case', () => {
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, 'ROTH IRA')).toBe(false);
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, 'roth ira')).toBe(false);
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, 'My Roth IRA Account')).toBe(false);
    });

    it('should not treat standalone "Roth" as Roth IRA (401k Roth)', () => {
      // "ROTH" without "IRA" is 401k Roth, which should allow all
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, 'ROTH')).toBe(true);
      expect(shouldImportTransaction(sampleTransactions.spyTransaction, 'Roth 401k')).toBe(true);
    });
  });
});

describe('filterDuplicateTransactions', () => {
  it('should filter out transactions with existing plaid_transaction_id', () => {
    const newTransactions = [
      { ...sampleTransactions.vtiNov20Original, transaction_hash: 'hash1' },
    ];
    const existingPlaidIds = new Set([sampleTransactions.vtiNov20Original.plaid_transaction_id]);
    const existingHashes = new Set();

    const result = filterDuplicateTransactions(newTransactions, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it('should filter out transactions with existing transaction_hash (re-link scenario)', () => {
    const originalHash = generateTransactionHash(sampleTransactions.vtiNov20Original);
    const relinkedHash = generateTransactionHash(sampleTransactions.vtiNov20Relinked);

    // Simulate: original is in DB, re-linked version comes in with new plaid_id
    const newTransactions = [
      { ...sampleTransactions.vtiNov20Relinked, transaction_hash: relinkedHash },
    ];
    const existingPlaidIds = new Set([sampleTransactions.vtiNov20Original.plaid_transaction_id]);
    const existingHashes = new Set([originalHash]); // Same hash!

    const result = filterDuplicateTransactions(newTransactions, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it('should allow genuinely new transactions through', () => {
    const newHash = generateTransactionHash(sampleTransactions.vtiNov21New);
    const newTransactions = [
      { ...sampleTransactions.vtiNov21New, transaction_hash: newHash },
    ];
    const existingPlaidIds = new Set([sampleTransactions.vtiNov20Original.plaid_transaction_id]);
    const existingHashes = new Set([generateTransactionHash(sampleTransactions.vtiNov20Original)]);

    const result = filterDuplicateTransactions(newTransactions, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(1);
    expect(result.duplicateCount).toBe(0);
  });

  it('should handle mixed batch of new and duplicate transactions', () => {
    const transactions = [
      { ...sampleTransactions.vtiNov20Relinked, transaction_hash: generateTransactionHash(sampleTransactions.vtiNov20Relinked) },
      { ...sampleTransactions.vtiNov21New, transaction_hash: generateTransactionHash(sampleTransactions.vtiNov21New) },
      { ...sampleTransactions.schdNov20, transaction_hash: generateTransactionHash(sampleTransactions.schdNov20) },
    ];

    // Nov 20 VTI already exists (by hash), SCHD already exists (by plaid_id)
    const existingPlaidIds = new Set([sampleTransactions.schdNov20.plaid_transaction_id]);
    const existingHashes = new Set([generateTransactionHash(sampleTransactions.vtiNov20Original)]);

    const result = filterDuplicateTransactions(transactions, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(1); // Only Nov 21 VTI
    expect(result.toImport[0].date).toBe('2025-11-21');
    expect(result.duplicateCount).toBe(2);
  });

  it('should handle empty inputs gracefully', () => {
    const result = filterDuplicateTransactions([], new Set(), new Set());

    expect(result.toImport).toHaveLength(0);
    expect(result.duplicateCount).toBe(0);
  });
});

describe('filterDuplicateDividends', () => {
  it('should filter out dividends with existing plaid_transaction_id', () => {
    const newDividends = [
      { ...sampleDividends.vtiDivOriginal, dividend_hash: 'hash1' },
    ];
    const existingPlaidIds = new Set([sampleDividends.vtiDivOriginal.plaid_transaction_id]);
    const existingHashes = new Set();

    const result = filterDuplicateDividends(newDividends, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it('should filter out dividends with existing dividend_hash (re-link scenario)', () => {
    const originalHash = generateDividendHash(sampleDividends.vtiDivOriginal);
    const relinkedHash = generateDividendHash(sampleDividends.vtiDivRelinked);

    const newDividends = [
      { ...sampleDividends.vtiDivRelinked, dividend_hash: relinkedHash },
    ];
    const existingPlaidIds = new Set([sampleDividends.vtiDivOriginal.plaid_transaction_id]);
    const existingHashes = new Set([originalHash]);

    const result = filterDuplicateDividends(newDividends, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it('should allow genuinely new dividends through', () => {
    const newHash = generateDividendHash(sampleDividends.schdDivNew);
    const newDividends = [
      { ...sampleDividends.schdDivNew, dividend_hash: newHash },
    ];
    const existingPlaidIds = new Set([sampleDividends.vtiDivOriginal.plaid_transaction_id]);
    const existingHashes = new Set([generateDividendHash(sampleDividends.vtiDivOriginal)]);

    const result = filterDuplicateDividends(newDividends, existingPlaidIds, existingHashes);

    expect(result.toImport).toHaveLength(1);
    expect(result.duplicateCount).toBe(0);
  });
});
