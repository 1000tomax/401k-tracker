import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DividendService } from '../../../src/services/DividendService.js';

// ============================================================================
// Sample Data
// ============================================================================

const sampleDividends = [
  // VTI dividends - quarterly pattern
  { date: '2024-03-15', fund: 'VTI', account: 'Roth IRA', amount: '12.50' },
  { date: '2024-06-15', fund: 'VTI', account: 'Roth IRA', amount: '13.00' },
  { date: '2024-09-15', fund: 'VTI', account: 'Roth IRA', amount: '13.25' },
  { date: '2024-12-15', fund: 'VTI', account: 'Roth IRA', amount: '14.00' },

  // SCHD dividends - monthly pattern
  { date: '2024-10-01', fund: 'SCHD', account: 'Voya 401(k)', amount: '5.00' },
  { date: '2024-11-01', fund: 'SCHD', account: 'Voya 401(k)', amount: '5.25' },
  { date: '2024-12-01', fund: 'SCHD', account: 'Voya 401(k)', amount: '5.50' },

  // VTI in different account
  { date: '2024-12-15', fund: 'VTI', account: 'Voya 401(k)', amount: '8.00' },
];

const dividendsMultiYear = [
  { date: '2023-06-15', fund: 'VTI', account: 'Roth IRA', amount: '10.00' },
  { date: '2023-12-15', fund: 'VTI', account: 'Roth IRA', amount: '11.00' },
  { date: '2024-06-15', fund: 'VTI', account: 'Roth IRA', amount: '12.00' },
  { date: '2024-12-15', fund: 'VTI', account: 'Roth IRA', amount: '13.00' },
  { date: '2025-01-15', fund: 'VTI', account: 'Roth IRA', amount: '14.00' },
];

// ============================================================================
// Tests
// ============================================================================

describe('DividendService', () => {
  let service;

  beforeEach(() => {
    service = new DividendService('https://api.example.com', 'test-token');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with apiUrl and token', () => {
      expect(service.apiUrl).toBe('https://api.example.com');
      expect(service.token).toBe('test-token');
    });
  });

  describe('aggregateByFund', () => {
    it('should aggregate dividends by fund ticker', () => {
      const result = service.aggregateByFund(sampleDividends);

      expect(result.VTI).toBeDefined();
      expect(result.SCHD).toBeDefined();
    });

    it('should calculate total amount per fund', () => {
      const result = service.aggregateByFund(sampleDividends);

      // VTI: 12.50 + 13.00 + 13.25 + 14.00 + 8.00 = 60.75
      expect(result.VTI.totalAmount).toBeCloseTo(60.75);

      // SCHD: 5.00 + 5.25 + 5.50 = 15.75
      expect(result.SCHD.totalAmount).toBeCloseTo(15.75);
    });

    it('should count payments per fund', () => {
      const result = service.aggregateByFund(sampleDividends);

      expect(result.VTI.count).toBe(5);
      expect(result.SCHD.count).toBe(3);
    });

    it('should track first and last payment dates', () => {
      const result = service.aggregateByFund(sampleDividends);

      expect(result.VTI.firstPayment).toBe('2024-03-15');
      expect(result.VTI.lastPayment).toBe('2024-12-15');
    });

    it('should store all payments in array', () => {
      const result = service.aggregateByFund(sampleDividends);

      expect(result.VTI.payments).toHaveLength(5);
      expect(result.SCHD.payments).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const result = service.aggregateByFund([]);

      expect(result).toEqual({});
    });

    it('should handle missing fund name', () => {
      const dividends = [{ date: '2024-01-01', amount: '10.00' }];
      const result = service.aggregateByFund(dividends);

      expect(result.Unknown).toBeDefined();
      expect(result.Unknown.totalAmount).toBe(10);
    });
  });

  describe('aggregateByAccount', () => {
    it('should aggregate dividends by account', () => {
      const result = service.aggregateByAccount(sampleDividends);

      expect(result['Roth IRA']).toBeDefined();
      expect(result['Voya 401(k)']).toBeDefined();
    });

    it('should calculate total amount per account', () => {
      const result = service.aggregateByAccount(sampleDividends);

      // Roth IRA: 12.50 + 13.00 + 13.25 + 14.00 = 52.75
      expect(result['Roth IRA'].totalAmount).toBeCloseTo(52.75);

      // Voya 401(k): 5.00 + 5.25 + 5.50 + 8.00 = 23.75
      expect(result['Voya 401(k)'].totalAmount).toBeCloseTo(23.75);
    });

    it('should track unique funds per account', () => {
      const result = service.aggregateByAccount(sampleDividends);

      expect(result['Roth IRA'].funds).toEqual(['VTI']);
      expect(result['Voya 401(k)'].funds).toContain('SCHD');
      expect(result['Voya 401(k)'].funds).toContain('VTI');
    });

    it('should handle missing account name', () => {
      const dividends = [{ date: '2024-01-01', fund: 'VTI', amount: '10.00' }];
      const result = service.aggregateByAccount(dividends);

      expect(result.Unknown).toBeDefined();
    });
  });

  describe('aggregateByMonth', () => {
    it('should aggregate dividends by month', () => {
      const result = service.aggregateByMonth(sampleDividends);

      // Should have entries for months with dividends
      const months = result.map((r) => r.month);
      expect(months).toContain('2024-03');
      expect(months).toContain('2024-12');
    });

    it('should calculate total per month', () => {
      const result = service.aggregateByMonth(sampleDividends);

      // December 2024: VTI 14.00 + VTI 8.00 + SCHD 5.50 = 27.50
      const december = result.find((r) => r.month === '2024-12');
      expect(december.totalAmount).toBeCloseTo(27.5);
    });

    it('should calculate running average', () => {
      const result = service.aggregateByMonth(sampleDividends);

      // First month should have runningAvg equal to its total
      expect(result[0].runningAvg).toBe(result[0].totalAmount);

      // Later months should have cumulative average
      const lastMonth = result[result.length - 1];
      const totalSum = result.reduce((sum, m) => sum + m.totalAmount, 0);
      expect(lastMonth.runningAvg).toBeCloseTo(totalSum / result.length);
    });

    it('should sort by month ascending', () => {
      const result = service.aggregateByMonth(sampleDividends);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].month > result[i - 1].month).toBe(true);
      }
    });

    it('should handle empty array', () => {
      const result = service.aggregateByMonth([]);

      expect(result).toEqual([]);
    });
  });

  describe('calculateYTD', () => {
    it('should calculate year-to-date total for current year', () => {
      // Current date is 2025-01-15, so only 2025 dividends count
      const ytd = service.calculateYTD(dividendsMultiYear);

      // Only the 2025-01-15 dividend of $14.00
      expect(ytd).toBeCloseTo(14.0);
    });

    it('should return 0 when no dividends in current year', () => {
      const oldDividends = [
        { date: '2023-01-01', fund: 'VTI', amount: '10.00' },
        { date: '2024-12-31', fund: 'VTI', amount: '10.00' },
      ];

      const ytd = service.calculateYTD(oldDividends);

      expect(ytd).toBe(0);
    });

    it('should handle empty array', () => {
      const ytd = service.calculateYTD([]);

      expect(ytd).toBe(0);
    });
  });

  describe('calculateTTM', () => {
    it('should calculate trailing 12 month total', () => {
      // Current date is 2025-01-15
      // TTM includes: 2024-01-16 through 2025-01-15
      const ttm = service.calculateTTM(dividendsMultiYear);

      // Includes: 2024-06-15 ($12), 2024-12-15 ($13), 2025-01-15 ($14) = $39
      expect(ttm).toBeCloseTo(39.0);
    });

    it('should exclude dividends older than 12 months', () => {
      const ttm = service.calculateTTM(dividendsMultiYear);

      // Should NOT include 2023 dividends
      expect(ttm).toBeLessThan(60); // Total of all is 60
    });

    it('should return 0 when no dividends in last 12 months', () => {
      const oldDividends = [
        { date: '2022-01-01', fund: 'VTI', amount: '10.00' },
        { date: '2023-01-01', fund: 'VTI', amount: '10.00' },
      ];

      const ttm = service.calculateTTM(oldDividends);

      expect(ttm).toBe(0);
    });

    it('should handle empty array', () => {
      const ttm = service.calculateTTM([]);

      expect(ttm).toBe(0);
    });
  });

  describe('detectPaymentFrequencies', () => {
    it('should detect quarterly payment pattern', () => {
      const quarterlyDividends = [
        { date: '2024-03-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-06-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-09-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-12-15', fund: 'VTI', amount: '10.00' },
      ];

      const frequencies = service.detectPaymentFrequencies(quarterlyDividends);

      expect(frequencies.VTI).toBe('Quarterly');
    });

    it('should detect monthly payment pattern', () => {
      const monthlyDividends = [
        { date: '2024-10-01', fund: 'JEPI', amount: '5.00' },
        { date: '2024-11-01', fund: 'JEPI', amount: '5.00' },
        { date: '2024-12-01', fund: 'JEPI', amount: '5.00' },
        { date: '2025-01-01', fund: 'JEPI', amount: '5.00' },
      ];

      const frequencies = service.detectPaymentFrequencies(monthlyDividends);

      expect(frequencies.JEPI).toBe('Monthly');
    });

    it('should detect annual payment pattern', () => {
      const annualDividends = [
        { date: '2022-12-15', fund: 'BRK.B', amount: '100.00' },
        { date: '2023-12-15', fund: 'BRK.B', amount: '100.00' },
        { date: '2024-12-15', fund: 'BRK.B', amount: '100.00' },
      ];

      const frequencies = service.detectPaymentFrequencies(annualDividends);

      expect(frequencies['BRK.B']).toBe('Annual');
    });

    it('should return null for funds with only one payment', () => {
      const singlePayment = [
        { date: '2024-12-15', fund: 'NEW', amount: '10.00' },
      ];

      const frequencies = service.detectPaymentFrequencies(singlePayment);

      expect(frequencies.NEW).toBeNull();
    });

    it('should handle multiple funds with different frequencies', () => {
      const mixedDividends = [
        // Quarterly VTI
        { date: '2024-03-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-06-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-09-15', fund: 'VTI', amount: '10.00' },
        // Monthly JEPI
        { date: '2024-10-01', fund: 'JEPI', amount: '5.00' },
        { date: '2024-11-01', fund: 'JEPI', amount: '5.00' },
        { date: '2024-12-01', fund: 'JEPI', amount: '5.00' },
      ];

      const frequencies = service.detectPaymentFrequencies(mixedDividends);

      expect(frequencies.VTI).toBe('Quarterly');
      expect(frequencies.JEPI).toBe('Monthly');
    });
  });

  describe('calculateCumulativeTimeline', () => {
    it('should calculate cumulative totals over time', () => {
      const dividends = [
        { date: '2024-01-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-02-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-03-15', fund: 'VTI', amount: '10.00' },
      ];

      const timeline = service.calculateCumulativeTimeline(dividends);

      // Cumulative should increase
      expect(timeline[0].cumulative).toBe(10);
      expect(timeline[1].cumulative).toBe(20);
      expect(timeline[2].cumulative).toBe(30);
    });

    it('should aggregate by month for data spanning more than a year', () => {
      const result = service.calculateCumulativeTimeline(dividendsMultiYear);

      // Should use monthly aggregation since data spans > 1 year
      // Check that dates are in YYYY-MM format
      expect(result[0].date).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should handle empty array', () => {
      const timeline = service.calculateCumulativeTimeline([]);

      expect(timeline).toEqual([]);
    });

    it('should track which funds paid in each period', () => {
      // Use same day so they're grouped together (short range = daily aggregation)
      const dividends = [
        { date: '2024-01-15', fund: 'VTI', amount: '10.00' },
        { date: '2024-01-15', fund: 'SCHD', amount: '5.00' },
      ];

      const timeline = service.calculateCumulativeTimeline(dividends);

      // Both funds paid on same day should be in same entry
      expect(timeline[0].funds).toContain('VTI');
      expect(timeline[0].funds).toContain('SCHD');
    });
  });

  describe('calculateYields', () => {
    it('should calculate dividend yield for each fund', () => {
      const dividends = [
        { date: '2024-06-15', fund: 'VTI', amount: '1.00' },
        { date: '2024-09-15', fund: 'VTI', amount: '1.00' },
        { date: '2024-12-15', fund: 'VTI', amount: '1.00' },
        { date: '2025-01-15', fund: 'VTI', amount: '1.00' },
      ];

      const prices = { VTI: { price: 100 } };

      const yields = service.calculateYields(dividends, prices);

      // TTM dividends = $4.00, price = $100, yield = 4%
      expect(yields.VTI).toBeCloseTo(4.0);
    });

    it('should return null for funds without price data', () => {
      const dividends = [
        { date: '2025-01-01', fund: 'UNKNOWN', amount: '10.00' },
      ];

      const yields = service.calculateYields(dividends, {});

      expect(yields.UNKNOWN).toBeNull();
    });

    it('should return 0 for funds with no TTM dividends', () => {
      const dividends = [
        { date: '2020-01-01', fund: 'VTI', amount: '10.00' }, // Old dividend
      ];

      const prices = { VTI: { price: 100 } };

      const yields = service.calculateYields(dividends, prices);

      expect(yields.VTI).toBe(0);
    });
  });

  describe('calculateProjectedAnnual', () => {
    it('should return TTM as projected annual income', () => {
      const projected = service.calculateProjectedAnnual(dividendsMultiYear);
      const ttm = service.calculateTTM(dividendsMultiYear);

      expect(projected).toBe(ttm);
    });
  });
});
