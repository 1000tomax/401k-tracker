import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryOverview from '@/components/SummaryOverview';

describe('SummaryOverview', () => {
  const defaultTotals = {
    contributions: 50000,
    netInvested: 45000,
    marketValue: 52000,
    gainLoss: 7000,
    roi: 0.1556, // 15.56%
  };

  const defaultFirstTransaction = '2024-01-15';

  it('should render all summary cards', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('Total Contributions')).toBeInTheDocument();
    expect(screen.getByText('Net Invested')).toBeInTheDocument();
    expect(screen.getByText('Market Value')).toBeInTheDocument();
    expect(screen.getByText('Total Gain / Loss')).toBeInTheDocument();
    expect(screen.getByText('Overall ROI')).toBeInTheDocument();
  });

  it('should format currency values correctly', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('$50,000.00')).toBeInTheDocument(); // Total Contributions
    expect(screen.getByText('$45,000.00')).toBeInTheDocument(); // Net Invested
    expect(screen.getByText('$52,000.00')).toBeInTheDocument(); // Market Value
    expect(screen.getByText('$7,000.00')).toBeInTheDocument();  // Gain/Loss
  });

  it('should format ROI as percentage', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('15.56%')).toBeInTheDocument();
  });

  it('should display first transaction date in helper text', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText(/Since.*Jan.*15.*2024/i)).toBeInTheDocument();
  });

  it('should apply positive tone to positive gain/loss', () => {
    const { container } = render(
      <SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />
    );

    const cards = container.querySelectorAll('.summary-card.positive');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should apply negative tone to negative gain/loss', () => {
    const totalsWithLoss = {
      ...defaultTotals,
      gainLoss: -2000,
      roi: -0.04,
    };

    const { container } = render(
      <SummaryOverview totals={totalsWithLoss} firstTransaction={defaultFirstTransaction} />
    );

    const cards = container.querySelectorAll('.summary-card.negative');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should handle zero contributions', () => {
    const totalsWithZero = {
      ...defaultTotals,
      contributions: 0,
    };

    render(<SummaryOverview totals={totalsWithZero} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('should handle null/undefined contributions', () => {
    const totalsWithNull = {
      ...defaultTotals,
      contributions: null,
    };

    render(<SummaryOverview totals={totalsWithNull} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('should handle missing first transaction date', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={null} />);

    expect(screen.getByText(/Since —/)).toBeInTheDocument();
  });

  it('should handle zero ROI', () => {
    const totalsWithZeroROI = {
      ...defaultTotals,
      gainLoss: 0,
      roi: 0,
    };

    render(<SummaryOverview totals={totalsWithZeroROI} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument(); // Gain/Loss
    expect(screen.getByText('0.00%')).toBeInTheDocument(); // ROI
  });

  it('should render with correct structure', () => {
    const { container } = render(
      <SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />
    );

    expect(container.querySelector('.summary-overview')).toBeInTheDocument();
    expect(container.querySelector('.summary-grid')).toBeInTheDocument();
    expect(container.querySelectorAll('.summary-card')).toHaveLength(5);
  });

  it('should display helper text only for Total Contributions card', () => {
    render(<SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />);

    const helpers = screen.getAllByText(/Since/);
    expect(helpers).toHaveLength(1);
  });

  it('should handle large numbers correctly', () => {
    const largeNumbers = {
      contributions: 1234567.89,
      netInvested: 1200000,
      marketValue: 1500000,
      gainLoss: 300000,
      roi: 0.25,
    };

    render(<SummaryOverview totals={largeNumbers} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
    expect(screen.getByText('$1,200,000.00')).toBeInTheDocument();
    expect(screen.getByText('$1,500,000.00')).toBeInTheDocument();
  });

  it('should handle negative net invested', () => {
    const negativeNetInvested = {
      contributions: 50000,
      netInvested: -5000, // More withdrawals than contributions
      marketValue: 40000,
      gainLoss: -10000,
      roi: -0.20,
    };

    render(<SummaryOverview totals={negativeNetInvested} firstTransaction={defaultFirstTransaction} />);

    expect(screen.getByText('-$5,000.00')).toBeInTheDocument();
  });

  it('should apply neutral tone by default', () => {
    const { container } = render(
      <SummaryOverview totals={defaultTotals} firstTransaction={defaultFirstTransaction} />
    );

    // Total Contributions, Net Invested, and Market Value should have neutral tone
    const neutralCards = container.querySelectorAll('.summary-card.neutral');
    expect(neutralCards.length).toBe(3);
  });
});
