/**
 * @file SummaryOverview.jsx
 * @description A component that displays a high-level summary of the portfolio's
 * performance using a grid of summary cards.
 */
import React from 'react';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters.js';

/**
 * A reusable card component for displaying a single metric in the summary overview.
 * @param {object} props - The component's props.
 * @param {string} props.label - The label for the metric (e.g., "Market Value").
 * @param {string} props.value - The formatted value of the metric.
 * @param {string} [props.helper] - Optional helper text to display below the value.
 * @param {string} [props.tone='neutral'] - The tone of the card ('positive', 'negative', or 'neutral'), used for styling.
 * @returns {React.Component}
 */
function SummaryCard({ label, value, helper, tone = 'neutral' }) {
  return (
    <div className={`summary-card ${tone}`}>
      <p className="summary-card-label">{label}</p>
      <p className="summary-card-value">{value}</p>
      {helper && <p className="summary-card-helper">{helper}</p>}
    </div>
  );
}

/**
 * The main SummaryOverview component.
 * @param {object} props - The component's props.
 * @param {object} props.totals - An object containing the aggregated portfolio totals.
 * @param {string} props.firstTransaction - The date of the first transaction.
 * @returns {React.Component}
 */
export default function SummaryOverview({ totals, firstTransaction }) {
  const contributionsLabel = totals.contributions ? formatCurrency(totals.contributions) : '$0.00';
  const netInvestedLabel = formatCurrency(totals.netInvested);
  const marketValueLabel = formatCurrency(totals.marketValue);
  // Use total gainLoss for "Total Gain / Loss" display (includes both open and closed positions)
  const totalGainLossLabel = formatCurrency(totals.gainLoss);
  const roiLabel = formatPercent(totals.roi);

  const firstDate = firstTransaction ? formatDate(firstTransaction) : '—';

  return (
    <div className="summary-overview">
      <div className="summary-grid">
        <SummaryCard label="Total Contributions" value={contributionsLabel} helper={`Since ${firstDate}`} />
        <SummaryCard label="Net Invested" value={netInvestedLabel} />
        <SummaryCard label="Market Value" value={marketValueLabel} />
        <SummaryCard
          label="Total Gain / Loss"
          value={totalGainLossLabel}
          tone={totals.gainLoss >= 0 ? 'positive' : 'negative'}
        />
        <SummaryCard
          label="Overall ROI"
          value={roiLabel}
          tone={totals.roi >= 0 ? 'positive' : 'negative'}
        />
      </div>
    </div>
  );
}
