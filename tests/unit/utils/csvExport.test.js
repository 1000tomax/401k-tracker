import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertHoldingsToCSV } from '../../../src/utils/csvExport.js';

// ============================================================================
// Sample Data
// ============================================================================

const sampleHoldings = {
  // Simple account with holdings
  simpleAccount: {
    accountName: 'Voya 401(k)',
    totalValue: 50000,
    holdings: [
      {
        fund: 'VTI',
        shares: 100,
        avgCost: 200,
        costBasis: 20000,
        latestNAV: 250,
        marketValue: 25000,
        gainLoss: 5000,
        firstBuyDate: '2023-01-15',
      },
      {
        fund: 'SCHD',
        shares: 50,
        avgCost: 400,
        costBasis: 20000,
        latestNAV: 500,
        marketValue: 25000,
        gainLoss: 5000,
        firstBuyDate: '2023-06-01',
      },
    ],
  },

  // Account with source breakdown (like Voya with Match/PreTax)
  accountWithSources: {
    accountName: 'Voya 401(k)',
    totalValue: 30000,
    holdings: [],
    sources: [
      {
        source: 'PreTax',
        holdings: [
          {
            fund: 'VTI',
            shares: 50,
            avgCost: 200,
            costBasis: 10000,
            latestNAV: 250,
            marketValue: 12500,
            gainLoss: 2500,
            firstBuyDate: '2023-01-15',
          },
        ],
      },
      {
        source: 'Match',
        holdings: [
          {
            fund: 'VTI',
            shares: 40,
            avgCost: 200,
            costBasis: 8000,
            latestNAV: 250,
            marketValue: 10000,
            gainLoss: 2000,
            firstBuyDate: '2023-03-01',
          },
        ],
      },
    ],
  },

  // Account with special characters in name
  accountWithSpecialChars: {
    accountName: 'Roth IRA "Special, Account"',
    totalValue: 10000,
    holdings: [
      {
        fund: 'QQQ',
        shares: 25,
        avgCost: 300,
        costBasis: 7500,
        latestNAV: 400,
        marketValue: 10000,
        gainLoss: 2500,
        firstBuyDate: '2024-01-01',
      },
    ],
  },

  // Account with negative gain/loss
  accountWithLoss: {
    accountName: 'Taxable Brokerage',
    totalValue: 8000,
    holdings: [
      {
        fund: 'ARKK',
        shares: 100,
        avgCost: 100,
        costBasis: 10000,
        latestNAV: 80,
        marketValue: 8000,
        gainLoss: -2000,
        firstBuyDate: '2021-02-15',
      },
    ],
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('convertHoldingsToCSV', () => {
  // Mock Date for consistent "days held" calculation
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic CSV generation', () => {
    it('should generate CSV with correct headers', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'Account,Fund,Source,Shares,Avg Cost,Cost Basis,Latest Price,Market Value,Gain/Loss,Gain/Loss %,Allocation %,First Purchase,Days Held'
      );
    });

    it('should include holding data rows', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount], 50000);
      const lines = csv.split('\n');

      // Second line should be VTI data
      expect(lines[1]).toContain('Voya 401(k)');
      expect(lines[1]).toContain('VTI');
      expect(lines[1]).toContain('100.0000'); // shares
      expect(lines[1]).toContain('25000.00'); // market value
    });

    it('should calculate gain/loss percentage correctly', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount], 50000);
      const lines = csv.split('\n');

      // VTI: gainLoss 5000 / costBasis 20000 = 25%
      expect(lines[1]).toContain('25.00');
    });

    it('should calculate allocation percentage correctly', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount], 50000);
      const lines = csv.split('\n');

      // VTI: marketValue 25000 / total 50000 = 50%
      expect(lines[1]).toContain('50.00');
    });

    it('should calculate days held from first purchase date', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);
      const lines = csv.split('\n');

      // VTI first buy: 2023-01-15, current: 2025-01-15 = 731 days (2 years)
      expect(lines[1]).toContain('731');
    });
  });

  describe('Source breakdown handling', () => {
    it('should export each source as separate rows', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.accountWithSources]);
      const lines = csv.split('\n');

      // Should have header + 2 source rows
      const dataRows = lines.filter(
        (line) => line.includes('VTI') && line.includes('Voya')
      );
      expect(dataRows.length).toBe(2);
    });

    it('should include source name in source column', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.accountWithSources]);

      expect(csv).toContain('PreTax');
      expect(csv).toContain('Match');
    });
  });

  describe('Special character escaping', () => {
    it('should escape values containing commas', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.accountWithSpecialChars]);

      // Account name with comma should be quoted
      expect(csv).toContain('"Roth IRA ""Special, Account"""');
    });

    it('should escape values containing double quotes', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.accountWithSpecialChars]);

      // Double quotes should be doubled and the value wrapped in quotes
      expect(csv).toContain('""Special');
    });
  });

  describe('Negative values', () => {
    it('should handle negative gain/loss correctly', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.accountWithLoss]);
      const lines = csv.split('\n');

      // Should contain -2000.00 for gain/loss
      expect(lines[1]).toContain('-2000.00');

      // Should contain -20.00 for gain/loss % (-2000/10000)
      expect(lines[1]).toContain('-20.00');
    });
  });

  describe('Summary section', () => {
    it('should include summary section with totals', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);

      expect(csv).toContain('SUMMARY');
      expect(csv).toContain('By Account');
      expect(csv).toContain('Overall Portfolio Total');
      expect(csv).toContain('TOTAL');
    });

    it('should calculate correct portfolio totals', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);

      // Total cost basis: 20000 + 20000 = 40000
      // Total market value: 25000 + 25000 = 50000
      // Total gain: 5000 + 5000 = 10000
      expect(csv).toContain('40000.00'); // cost basis
      expect(csv).toContain('50000.00'); // market value
      expect(csv).toContain('10000.00'); // gain/loss
    });

    it('should show 100% allocation for total row', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);
      const lines = csv.split('\n');

      const totalLine = lines.find((line) => line.startsWith('TOTAL'));
      expect(totalLine).toContain('100.00');
    });
  });

  describe('Edge cases', () => {
    it('should return only headers for empty holdings array', () => {
      const csv = convertHoldingsToCSV([]);

      expect(csv).toBe(
        'Account,Fund,Source,Shares,Avg Cost,Cost Basis,Latest Price,Market Value,Gain/Loss,Gain/Loss %,Allocation %,First Purchase,Days Held'
      );
    });

    it('should return only headers for null input', () => {
      const csv = convertHoldingsToCSV(null);

      expect(csv).toBe(
        'Account,Fund,Source,Shares,Avg Cost,Cost Basis,Latest Price,Market Value,Gain/Loss,Gain/Loss %,Allocation %,First Purchase,Days Held'
      );
    });

    it('should handle account with empty holdings array', () => {
      const emptyAccount = {
        accountName: 'Empty Account',
        totalValue: 0,
        holdings: [],
      };

      const csv = convertHoldingsToCSV([emptyAccount]);

      // Should just have headers and summary
      expect(csv).toContain('SUMMARY');
    });

    it('should handle holdings with missing fields', () => {
      const incompleteHolding = {
        accountName: 'Incomplete',
        totalValue: 0,
        holdings: [
          {
            fund: 'TEST',
            // Missing most fields
          },
        ],
      };

      const csv = convertHoldingsToCSV([incompleteHolding]);

      expect(csv).toContain('TEST');
      expect(csv).toContain('0.00'); // Should default to 0
    });

    it('should handle zero cost basis without dividing by zero', () => {
      const zeroCostBasis = {
        accountName: 'Zero Cost',
        totalValue: 1000,
        holdings: [
          {
            fund: 'FREE',
            shares: 10,
            avgCost: 0,
            costBasis: 0,
            latestNAV: 100,
            marketValue: 1000,
            gainLoss: 1000,
          },
        ],
      };

      const csv = convertHoldingsToCSV([zeroCostBasis]);
      const lines = csv.split('\n');

      // Should show 0.00% gain/loss instead of Infinity or NaN
      expect(lines[1]).toContain('0.00');
      expect(csv).not.toContain('Infinity');
      expect(csv).not.toContain('NaN');
    });

    it('should handle missing first buy date', () => {
      const noDate = {
        accountName: 'No Date',
        totalValue: 1000,
        holdings: [
          {
            fund: 'TEST',
            shares: 10,
            avgCost: 100,
            costBasis: 1000,
            latestNAV: 100,
            marketValue: 1000,
            gainLoss: 0,
            // No firstBuyDate
          },
        ],
      };

      const csv = convertHoldingsToCSV([noDate]);

      // Should not throw, and days held should be empty
      expect(csv).toContain('TEST');
    });

    it('should calculate total portfolio value if not provided', () => {
      const csv = convertHoldingsToCSV([sampleHoldings.simpleAccount]);

      // Should still calculate allocation percentages
      expect(csv).toContain('50.00'); // Each holding is 50% of 50000
    });
  });

  describe('Multiple accounts', () => {
    it('should aggregate data from multiple accounts', () => {
      const csv = convertHoldingsToCSV([
        sampleHoldings.simpleAccount,
        sampleHoldings.accountWithLoss,
      ]);

      expect(csv).toContain('Voya 401(k)');
      expect(csv).toContain('Taxable Brokerage');
      expect(csv).toContain('VTI');
      expect(csv).toContain('ARKK');
    });

    it('should show account totals in summary', () => {
      const csv = convertHoldingsToCSV([
        sampleHoldings.simpleAccount,
        sampleHoldings.accountWithLoss,
      ]);

      // Summary should list both accounts
      expect(csv).toContain('By Account');
    });
  });
});
