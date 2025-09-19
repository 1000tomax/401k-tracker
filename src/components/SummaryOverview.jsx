import React from 'react';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters.js';

function SummaryCard({ label, value, helper, tone = 'neutral' }) {
  return (
    <div className={`summary-card ${tone}`}>
      <p className="summary-card-label">{label}</p>
      <p className="summary-card-value">{value}</p>
      {helper && <p className="summary-card-helper">{helper}</p>}
    </div>
  );
}

export default function SummaryOverview({ totals, firstTransaction }) {
  const contributionsLabel = totals.contributions ? formatCurrency(totals.contributions) : '$0.00';
  const netInvestedLabel = formatCurrency(totals.netInvested);
  const marketValueLabel = formatCurrency(totals.marketValue);
  const gainLossLabel = formatCurrency(totals.gainLoss);
  const roiLabel = formatPercent(totals.roi);

  const firstDate = firstTransaction ? formatDate(firstTransaction) : '—';

  return (
    <div className="summary-overview">
      <div className="summary-grid">
        <SummaryCard label="Total Contributions" value={contributionsLabel} helper={`Since ${firstDate}`} />
        <SummaryCard label="Net Invested" value={netInvestedLabel} />
        <SummaryCard label="Market Value" value={marketValueLabel} />
        <SummaryCard
          label="Unrealized Gain / Loss"
          value={gainLossLabel}
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
