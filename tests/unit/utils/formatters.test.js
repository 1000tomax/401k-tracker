import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatShares,
  formatUnitPrice,
  formatPercent,
  formatDate,
  formatFundName,
  formatSourceName,
} from '@/utils/formatters';

describe('formatCurrency', () => {
  it('should format positive numbers as currency', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0.99)).toBe('$0.99');
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });

  it('should format negative numbers as currency', () => {
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    expect(formatCurrency(-0.01)).toBe('-$0.01');
  });

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency(Infinity)).toBe('$0.00');
    expect(formatCurrency(-Infinity)).toBe('$0.00');
  });

  it('should round to 2 decimal places', () => {
    expect(formatCurrency(1.235)).toBe('$1.24');
    expect(formatCurrency(1.234)).toBe('$1.23');
  });
});

describe('formatShares', () => {
  it('should format shares with high precision', () => {
    expect(formatShares(123.456789)).toBe('123.456789');
    expect(formatShares(0.123456)).toBe('0.123456');
  });

  it('should handle whole numbers', () => {
    expect(formatShares(100)).toBe('100.000');
  });

  it('should handle negative shares', () => {
    expect(formatShares(-50.123)).toBe('-50.123');
  });

  it('should handle non-finite values', () => {
    expect(formatShares(NaN)).toBe('0.000');
    expect(formatShares(Infinity)).toBe('0.000');
  });

  it('should use minimum 3 decimal places', () => {
    expect(formatShares(1)).toBe('1.000');
    expect(formatShares(1.1)).toBe('1.100');
  });

  it('should use maximum 6 decimal places', () => {
    expect(formatShares(1.12345678)).toBe('1.123457');
  });
});

describe('formatUnitPrice', () => {
  it('should format unit prices with extended precision', () => {
    expect(formatUnitPrice(123.456789)).toBe('$123.456789');
    expect(formatUnitPrice(1.23)).toBe('$1.23');
  });

  it('should handle whole numbers', () => {
    expect(formatUnitPrice(100)).toBe('$100.00');
  });

  it('should handle very small prices', () => {
    expect(formatUnitPrice(0.000123)).toBe('$0.000123');
  });

  it('should handle non-finite values', () => {
    expect(formatUnitPrice(NaN)).toBe('$0.00');
    expect(formatUnitPrice(Infinity)).toBe('$0.00');
  });

  it('should format large prices correctly', () => {
    expect(formatUnitPrice(1234.5678)).toBe('$1,234.5678');
  });
});

describe('formatPercent', () => {
  it('should convert decimal to percentage', () => {
    expect(formatPercent(0.123)).toBe('12.30%');
    expect(formatPercent(0.5)).toBe('50.00%');
    expect(formatPercent(1.0)).toBe('100.00%');
  });

  it('should handle negative percentages', () => {
    expect(formatPercent(-0.123)).toBe('-12.30%');
  });

  it('should handle zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('should handle non-finite values', () => {
    expect(formatPercent(NaN)).toBe('0%');
    expect(formatPercent(Infinity)).toBe('0%');
  });

  it('should round to 2 decimal places', () => {
    expect(formatPercent(0.12345)).toBe('12.35%');
    expect(formatPercent(0.12344)).toBe('12.34%');
  });

  it('should handle percentages over 100%', () => {
    expect(formatPercent(2.5)).toBe('250.00%');
  });
});

describe('formatDate', () => {
  it('should format ISO date strings', () => {
    const result = formatDate('2025-10-07');
    expect(result).toMatch(/Oct.*7.*2025/);
  });

  it('should format ISO datetime strings', () => {
    const result = formatDate('2025-10-07T12:00:00');
    expect(result).toMatch(/Oct.*7.*2025/);
  });

  it('should handle date strings with different separators', () => {
    const result = formatDate('2025-01-15');
    expect(result).toMatch(/Jan.*15.*2025/);
  });

  it('should handle null/undefined values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('should handle invalid date strings', () => {
    const result = formatDate('invalid-date');
    expect(result).toBe('invalid-date');
  });

  it('should parse dates as local to avoid timezone shifts', () => {
    // Date-only strings should be treated as local
    const result = formatDate('2025-12-25');
    expect(result).toMatch(/Dec.*25.*2025/);
  });
});

describe('formatFundName', () => {
  it('should apply fund name overrides', () => {
    expect(formatFundName('0899 Vanguard 500 Index Fund Adm')).toBe('Vanguard 500');
  });

  it('should return original name when no override exists', () => {
    expect(formatFundName('VTI')).toBe('VTI');
    expect(formatFundName('Some Other Fund')).toBe('Some Other Fund');
  });

  it('should handle null/undefined values', () => {
    expect(formatFundName(null)).toBe('Unknown');
    expect(formatFundName(undefined)).toBe('Unknown');
    expect(formatFundName('')).toBe('Unknown');
  });
});

describe('formatSourceName', () => {
  it('should apply source name overrides', () => {
    expect(formatSourceName('Safe Harbor Match')).toBe('Match');
    expect(formatSourceName('Employee PreTax')).toBe('Traditional');
    expect(formatSourceName('Employee Post Tax')).toBe('Roth');
    expect(formatSourceName('She Roth on that thing til i IRA')).toBe('Roth IRA');
  });

  it('should return original name when no override exists', () => {
    expect(formatSourceName('Some Other Source')).toBe('Some Other Source');
  });

  it('should handle null/undefined values', () => {
    expect(formatSourceName(null)).toBe('Unknown');
    expect(formatSourceName(undefined)).toBe('Unknown');
    expect(formatSourceName('')).toBe('Unknown');
  });
});
