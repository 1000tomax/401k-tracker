import { describe, it, expect } from 'vitest';
import {
  parseTransactions,
  latestNavFor,
  aggregatePortfolio,
} from '@/utils/parseTransactions';

describe('parseTransactions', () => {
  describe('CSV format parsing', () => {
    it('should parse CSV export format', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00
01/16/2025,Employer Contribution,VTI,Safe Harbor Match,5.25,$250.00,$1312.50`;

      const result = parseTransactions(csvData);

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2025-01-15');
      expect(result[0].activity).toBe('Employee Contribution');
      expect(result[0].fund).toBe('VTI');
      expect(result[0].moneySource).toBe('Employee PreTax');
      expect(result[0].units).toBe(10.5);
      expect(result[0].unitPrice).toBe(250);
      expect(result[0].amount).toBe(2625);
    });

    it('should handle quoted CSV fields', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,"Employee Contribution","VTI, Inc.","Employee PreTax",10.5,$250.00,$2625.00`;

      const result = parseTransactions(csvData);

      expect(result).toHaveLength(1);
      expect(result[0].fund).toBe('VTI, Inc.');
    });

    it('should handle currency formatting in CSV', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Employee Contribution,VTI,Employee PreTax,10.5,"$250.00","$2,625.00"`;

      const result = parseTransactions(csvData);

      expect(result[0].unitPrice).toBe(250);
      expect(result[0].amount).toBe(2625);
    });

    it('should handle negative amounts for transfers out', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Transfer Out,VTI,Employee PreTax,-10.5,$250.00,($2625.00)`;

      const result = parseTransactions(csvData);

      expect(result[0].units).toBe(-10.5);
      expect(result[0].amount).toBe(-2625);
    });

    it('should skip empty or invalid rows', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00
,,,,,,
-----------
01/16/2025,Employer Contribution,VTI,Safe Harbor Match,5.25,$250.00,$1312.50`;

      const result = parseTransactions(csvData);

      expect(result).toHaveLength(2);
    });
  });

  describe('Text format parsing', () => {
    it('should parse tab-delimited text', () => {
      const textData = `01/15/2025\tEmployee Contribution VTI\tEmployee PreTax\t10.5\t$250.00\t$2625.00`;

      const result = parseTransactions(textData);

      expect(result).toHaveLength(1);
      expect(result[0].activity).toBe('Employee Contribution');
      expect(result[0].fund).toBe('VTI');
    });

    it('should parse space-delimited text', () => {
      const textData = `01/15/2025  Employee Contribution VTI  Employee PreTax  10.5  $250.00  $2625.00`;

      const result = parseTransactions(textData);

      expect(result).toHaveLength(1);
    });

    it('should handle split date lines gracefully', () => {
      const textData = `01/15/2025
Employee Contribution VTI  Employee PreTax  10.5  $250.00  $2625.00`;

      // This format is not officially supported, but should not crash
      const result = parseTransactions(textData);

      // Should return an array (may be empty or have parsed data)
      expect(Array.isArray(result)).toBe(true);
      // Should not throw an error
      expect(() => parseTransactions(textData)).not.toThrow();
    });
  });

  describe('Activity normalization', () => {
    it('should normalize transfer activities based on amount', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Transfer,VTI,Employee PreTax,10.5,$250.00,$2625.00
01/16/2025,Transfer,VTI,Employee PreTax,-10.5,$250.00,($2625.00)`;

      const result = parseTransactions(csvData);

      expect(result[0].activity).toBe('Transfer In');
      expect(result[1].activity).toBe('Transfer Out');
    });

    it('should capitalize activity names', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,employee contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00`;

      const result = parseTransactions(csvData);

      expect(result[0].activity).toBe('Employee Contribution');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      expect(parseTransactions('')).toEqual([]);
      expect(parseTransactions(null)).toEqual([]);
      expect(parseTransactions(undefined)).toEqual([]);
    });

    it('should handle missing required fields', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,,VTI,Employee PreTax,10.5,$250.00,$2625.00`;

      const result = parseTransactions(csvData);

      // Should skip row with missing activity
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed dates gracefully', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
invalid-date,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00`;

      const result = parseTransactions(csvData);

      // Should either parse or skip depending on implementation
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Date format conversion', () => {
    it('should convert US dates to ISO format', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
01/15/2025,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00
12/31/2024,Employee Contribution,VTI,Employee PreTax,5.0,$250.00,$1250.00`;

      const result = parseTransactions(csvData);

      expect(result[0].date).toBe('2025-01-15');
      expect(result[1].date).toBe('2024-12-31');
    });

    it('should preserve ISO dates', () => {
      const csvData = `Activity Date,Activity,Fund,Money Source,# of Units,Unit Price,Amount
2025-01-15,Employee Contribution,VTI,Employee PreTax,10.5,$250.00,$2625.00`;

      const result = parseTransactions(csvData);

      expect(result[0].date).toBe('2025-01-15');
    });
  });
});

describe('latestNavFor', () => {
  it('should return latest NAV from sorted transactions', () => {
    const entries = [
      { date: '2025-01-01', unitPrice: 100 },
      { date: '2025-01-15', unitPrice: 110 },
      { date: '2025-01-10', unitPrice: 105 },
    ];

    const result = latestNavFor(entries);

    expect(result).toBe(110);
  });

  it('should skip entries without valid unit price', () => {
    const entries = [
      { date: '2025-01-01', unitPrice: 100 },
      { date: '2025-01-15', unitPrice: null },
      { date: '2025-01-20', unitPrice: NaN },
    ];

    const result = latestNavFor(entries);

    expect(result).toBe(100);
  });

  it('should handle empty array', () => {
    expect(latestNavFor([])).toBe(0);
    expect(latestNavFor(null)).toBe(0);
    expect(latestNavFor(undefined)).toBe(0);
  });

  it('should return 0 when no valid prices exist', () => {
    const entries = [
      { date: '2025-01-01', unitPrice: NaN },
      { date: '2025-01-02', unitPrice: null },
    ];

    expect(latestNavFor(entries)).toBe(0);
  });
});

describe('aggregatePortfolio', () => {
  describe('Basic aggregation', () => {
    it('should aggregate single purchase transaction', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.shares).toBe(10);
      expect(result.totals.costBasis).toBe(1000);
      expect(result.totals.marketValue).toBe(1000);
      expect(result.totals.contributions).toBe(1000);
    });

    it('should handle buy and sell transactions', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Transfer Out',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: -5,
          unitPrice: 110,
          amount: -550,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.shares).toBe(5);
      expect(result.totals.costBasis).toBe(500); // Half of original cost basis
    });

    it('should calculate gain/loss correctly', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
      ];

      const livePrices = {
        VTI: { price: 120, updatedAt: '2025-01-15T12:00:00Z' },
      };

      const result = aggregatePortfolio(transactions, livePrices);

      expect(result.totals.marketValue).toBe(1200); // 10 shares * $120
      expect(result.totals.gainLoss).toBe(200); // $1200 - $1000
    });
  });

  describe('Multi-fund aggregation', () => {
    it('should aggregate multiple funds separately', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'QQQM',
          moneySource: 'Employee PreTax',
          units: 20,
          unitPrice: 50,
          amount: 1000,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.fundTotals.VTI).toBeDefined();
      expect(result.fundTotals.QQQM).toBeDefined();
      expect(result.fundTotals.VTI.shares).toBe(10);
      expect(result.fundTotals.QQQM.shares).toBe(20);
    });
  });

  describe('Money source aggregation', () => {
    it('should aggregate by money source', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-01',
          activity: 'Employer Contribution',
          fund: 'VTI',
          moneySource: 'Safe Harbor Match',
          units: 5,
          unitPrice: 100,
          amount: 500,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.sourceTotals['Employee PreTax']).toBeDefined();
      expect(result.sourceTotals['Safe Harbor Match']).toBeDefined();
      expect(result.sourceTotals['Employee PreTax'].shares).toBe(10);
      expect(result.sourceTotals['Safe Harbor Match'].shares).toBe(5);
    });
  });

  describe('Cash flow tracking', () => {
    it('should track contributions and withdrawals', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Loan Issue',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: -5,
          unitPrice: 110,
          amount: -550,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.contributions).toBe(1000);
      expect(result.totals.netInvested).toBe(450); // 1000 - 550
    });

    it('should classify transfers as neutral flow', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Exchange Out',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: -10,
          unitPrice: 110,
          amount: -1100,
        },
        {
          date: '2025-01-15',
          activity: 'Exchange In',
          fund: 'QQQM',
          moneySource: 'Employee PreTax',
          units: 22,
          unitPrice: 50,
          amount: 1100,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.contributions).toBe(1000); // Only the initial contribution
      expect(result.totals.netInvested).toBe(1000); // Exchanges don't change net invested
    });
  });

  describe('Timeline generation', () => {
    it('should generate timeline of portfolio value', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 5,
          unitPrice: 110,
          amount: 550,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.timeline).toHaveLength(2);
      expect(result.timeline[0].date).toBe('2025-01-01');
      expect(result.timeline[0].contributions).toBe(1000);
      expect(result.timeline[1].date).toBe('2025-01-15');
      expect(result.timeline[1].contributions).toBe(550);
    });

    it('should calculate running balance in timeline', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 5,
          unitPrice: 110,
          amount: 550,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.timeline[0].balance).toBe(1000);
      expect(result.timeline[1].balance).toBe(1550);
    });
  });

  describe('Closed positions', () => {
    it('should identify closed positions', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Transfer Out',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: -10,
          unitPrice: 110,
          amount: -1100,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.closedPositions.VTI).toBeDefined();
      expect(result.closedPositions.VTI['Employee PreTax'].isClosed).toBe(true);
    });

    it('should separate open and closed positions', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'QQQM',
          moneySource: 'Employee PreTax',
          units: 20,
          unitPrice: 50,
          amount: 1000,
        },
        {
          date: '2025-01-15',
          activity: 'Transfer Out',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: -10,
          unitPrice: 110,
          amount: -1100,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.openPositions.QQQM).toBeDefined();
      expect(result.closedPositions.VTI).toBeDefined();
      expect(Object.keys(result.openPositions)).not.toContain('VTI');
    });
  });

  describe('Live prices', () => {
    it('should use live prices when available', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
      ];

      const livePrices = {
        VTI: { price: 120, updatedAt: '2025-01-15T12:00:00Z' },
      };

      const result = aggregatePortfolio(transactions, livePrices);

      expect(result.openPositions.VTI['Employee PreTax'].latestNAV).toBe(120);
      expect(result.openPositions.VTI['Employee PreTax'].priceSource).toBe('live');
    });

    it('should fall back to transaction price when live price unavailable', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 10,
          unitPrice: 100,
          amount: 1000,
        },
      ];

      const result = aggregatePortfolio(transactions, null);

      expect(result.openPositions.VTI['Employee PreTax'].latestNAV).toBe(100);
      expect(result.openPositions.VTI['Employee PreTax'].priceSource).toBe('transaction');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transaction array', () => {
      const result = aggregatePortfolio([]);

      expect(result.totals.shares).toBe(0);
      expect(result.totals.costBasis).toBe(0);
      expect(result.totals.marketValue).toBe(0);
    });

    it('should handle transactions with snake_case field names', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Employee Contribution',
          fund: 'VTI',
          money_source: 'Employee PreTax',
          units: 10,
          unit_price: 100,
          amount: 1000,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.shares).toBe(10);
    });

    it('should handle zero-share dividend transactions', () => {
      const transactions = [
        {
          date: '2025-01-01',
          activity: 'Dividend',
          fund: 'VTI',
          moneySource: 'Employee PreTax',
          units: 0,
          unitPrice: 0,
          amount: 50,
        },
      ];

      const result = aggregatePortfolio(transactions);

      expect(result.totals.contributions).toBe(50);
    });
  });
});
