import { describe, it, expect } from 'vitest';
import {
  FUND_EXPENSE_RATIOS,
  calculateWeightedExpenseRatio,
  calculateDividendMetrics,
} from '@/utils/portfolioMetrics';

describe('FUND_EXPENSE_RATIOS', () => {
  it('should have expense ratios for common funds', () => {
    expect(FUND_EXPENSE_RATIOS.VTI).toBe(0.03);
    expect(FUND_EXPENSE_RATIOS.VOO).toBe(0.03);
    expect(FUND_EXPENSE_RATIOS.VXUS).toBe(0.07);
    expect(FUND_EXPENSE_RATIOS.QQQM).toBe(0.15);
    expect(FUND_EXPENSE_RATIOS.DEFAULT).toBe(0.10);
  });
});

describe('calculateWeightedExpenseRatio', () => {
  it('should calculate weighted expense ratio for single holding', () => {
    const holdings = [
      { fund: 'VTI', shares: 100, marketValue: 10000 },
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    expect(result.weightedAverage).toBe(0.03);
    expect(result.annualCost).toBeCloseTo(3, 1); // 10000 * 0.03 / 100
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].fund).toBe('VTI');
    expect(result.breakdown[0].expenseRatio).toBe(0.03);
    expect(result.breakdown[0].weight).toBe(100);
  });

  it('should calculate weighted expense ratio for multiple holdings', () => {
    const holdings = [
      { fund: 'VTI', shares: 100, marketValue: 10000 },  // 50% weight, 0.03 ER
      { fund: 'QQQM', shares: 50, marketValue: 10000 },  // 50% weight, 0.15 ER
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    // Expected: (0.03 * 0.5) + (0.15 * 0.5) = 0.09
    expect(result.weightedAverage).toBeCloseTo(0.09, 5);
    expect(result.annualCost).toBeCloseTo(18, 2); // 20000 * 0.09 / 100
    expect(result.breakdown).toHaveLength(2);
    expect(result.totalValue).toBe(20000);
  });

  it('should use DEFAULT expense ratio for unknown funds', () => {
    const holdings = [
      { fund: 'UNKNOWN_FUND', shares: 100, marketValue: 10000 },
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    expect(result.weightedAverage).toBe(0.10); // DEFAULT
    expect(result.breakdown[0].expenseRatio).toBe(0.10);
  });

  it('should handle Vanguard 500 fund variations', () => {
    const holdings = [
      { fund: '0899 Vanguard 500 Index Fund Adm', shares: 100, marketValue: 10000 },
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    expect(result.breakdown[0].expenseRatio).toBe(0.04);
  });

  it('should sort breakdown by weight descending', () => {
    const holdings = [
      { fund: 'VTI', shares: 50, marketValue: 5000 },   // 25%
      { fund: 'QQQM', shares: 100, marketValue: 15000 }, // 75%
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    expect(result.breakdown[0].fund).toBe('QQQM'); // Higher weight first
    expect(result.breakdown[1].fund).toBe('VTI');
  });

  it('should handle empty holdings array', () => {
    const result = calculateWeightedExpenseRatio([]);

    expect(result.weightedAverage).toBe(0);
    expect(result.annualCost).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it('should handle null/undefined holdings', () => {
    expect(calculateWeightedExpenseRatio(null).weightedAverage).toBe(0);
    expect(calculateWeightedExpenseRatio(undefined).weightedAverage).toBe(0);
  });

  it('should calculate annual cost correctly', () => {
    const holdings = [
      { fund: 'VTI', shares: 100, marketValue: 100000 },
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    // Annual cost = marketValue * (expenseRatio / 100)
    // = 100000 * (0.03 / 100) = 30
    expect(result.annualCost).toBeCloseTo(30, 1);
  });

  it('should handle case-insensitive fund matching', () => {
    const holdings = [
      { fund: 'vti', shares: 100, marketValue: 10000 },
      { fund: 'VTI', shares: 100, marketValue: 10000 },
      { fund: 'Vti', shares: 100, marketValue: 10000 },
    ];

    const result = calculateWeightedExpenseRatio(holdings);

    // All should match VTI with 0.03 ER
    result.breakdown.forEach(item => {
      expect(item.expenseRatio).toBe(0.03);
    });
  });
});

describe('calculateDividendMetrics', () => {
  const now = new Date('2025-11-04');
  const oneYearAgo = new Date('2024-11-04');
  const ytdStart = new Date('2025-01-01');

  it('should calculate TTM and YTD dividend totals', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
      { date: '2025-07-01', amount: '100', fund: 'VTI' },
      { date: '2025-04-01', amount: '100', fund: 'VTI' },
      { date: '2025-01-01', amount: '100', fund: 'VTI' },
      { date: '2024-10-01', amount: '100', fund: 'VTI' }, // Outside TTM
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.ttm).toBe(400); // 4 most recent dividends
    expect(result.ytd).toBe(400); // All from 2025
  });

  it('should calculate portfolio yield', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
      { date: '2025-07-01', amount: '100', fund: 'VTI' },
      { date: '2025-04-01', amount: '100', fund: 'VTI' },
      { date: '2025-01-01', amount: '100', fund: 'VTI' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    // Portfolio yield = (TTM dividends / total value) * 100
    // = (400 / 10000) * 100 = 4%
    expect(result.portfolioYield).toBe(4);
  });

  it('should calculate per-fund dividend metrics', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
      { fund: 'QQQM', marketValue: 5000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
      { date: '2025-10-01', amount: '50', fund: 'QQQM' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.byFund).toHaveLength(2);

    const vtiMetrics = result.byFund.find(f => f.fund === 'VTI');
    expect(vtiMetrics.ttmDividends).toBe(100);
    expect(vtiMetrics.yield).toBe(1); // (100 / 10000) * 100

    const qqqmMetrics = result.byFund.find(f => f.fund === 'QQQM');
    expect(qqqmMetrics.ttmDividends).toBe(50);
    expect(qqqmMetrics.yield).toBe(1); // (50 / 5000) * 100
  });

  it('should sort funds by TTM dividends descending', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
      { fund: 'QQQM', marketValue: 5000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '50', fund: 'VTI' },
      { date: '2025-10-01', amount: '100', fund: 'QQQM' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.byFund[0].fund).toBe('QQQM'); // Higher dividends first
    expect(result.byFund[1].fund).toBe('VTI');
  });

  it('should handle holdings with no dividends', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.ttm).toBe(0);
    expect(result.ytd).toBe(0);
    expect(result.portfolioYield).toBe(0);
    expect(result.byFund).toBeDefined();
    if (result.byFund.length > 0) {
      expect(result.byFund[0].ttmDividends).toBe(0);
    }
  });

  it('should handle empty inputs', () => {
    expect(calculateDividendMetrics([], []).portfolioYield).toBe(0);
    expect(calculateDividendMetrics(null, null).portfolioYield).toBe(0);
    expect(calculateDividendMetrics(undefined, undefined).portfolioYield).toBe(0);
  });

  it('should handle dividends from unknown funds', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'UNKNOWN_FUND' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    // Unknown fund dividends should still count in TTM/YTD totals
    expect(result.ttm).toBe(100);
    expect(result.ytd).toBe(100);

    // But won't show in byFund for VTI
    const vtiMetrics = result.byFund.find(f => f.fund === 'VTI');
    expect(vtiMetrics.ttmDividends).toBe(0);
  });

  it('should use TTM as projected annual dividend', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
      { date: '2025-07-01', amount: '100', fund: 'VTI' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.projectedAnnual).toBe(result.ttm);
  });

  it('should handle string and number amounts', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
      { date: '2025-07-01', amount: 100, fund: 'VTI' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.ttm).toBe(200);
  });

  it('should include totalValue in results when dividends present', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 10000 },
      { fund: 'QQQM', marketValue: 5000 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.totalValue).toBe(15000);
  });

  it('should handle zero market value', () => {
    const holdings = [
      { fund: 'VTI', marketValue: 0 },
    ];

    const dividends = [
      { date: '2025-10-01', amount: '100', fund: 'VTI' },
    ];

    const result = calculateDividendMetrics(holdings, dividends);

    expect(result.portfolioYield).toBe(0); // Avoid division by zero
  });
});
