import React from 'react';
import {
  formatCurrency,
  formatPercent,
  formatShares,
  formatDate,
} from '../utils/formatters.js';

function SummaryCard({ label, value, helper, tone = 'neutral' }) {
  return (
    <div className={`summary-card ${tone}`}>
      <p className="summary-card-label">{label}</p>
      <p className="summary-card-value">{value}</p>
      {helper && <p className="summary-card-helper">{helper}</p>}
    </div>
  );
}

export default function SummaryOverview({ totals, sourceTotals, timeline, firstTransaction }) {
  const sources = Object.entries(sourceTotals || {});
  const recentTimeline = (timeline || []).slice(-6).reverse();

  const contributionsLabel = totals.contributions ? formatCurrency(totals.contributions) : '$0.00';
  const withdrawalsLabel = totals.withdrawals ? formatCurrency(totals.withdrawals) : '$0.00';
  const netInvestedLabel = formatCurrency(totals.netInvested);
  const marketValueLabel = formatCurrency(totals.marketValue);
  const gainLossLabel = formatCurrency(totals.gainLoss);
  const roiLabel = formatPercent(totals.roi);

  const firstDate = firstTransaction ? formatDate(firstTransaction) : '—';

  return (
    <div className="summary-overview">
      <div className="summary-grid">
        <SummaryCard label="Total Contributions" value={contributionsLabel} helper={`Since ${firstDate}`} />
        <SummaryCard label="Total Withdrawals" value={withdrawalsLabel} />
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

      {sources.length > 0 && (
        <div className="summary-section">
          <h3>By Money Source</h3>
          <div className="table-wrapper compact">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Shares</th>
                  <th>Contributions</th>
                  <th>Withdrawals</th>
                  <th>Net Invested</th>
                  <th>Market Value</th>
                  <th>Gain / Loss</th>
                  <th>ROI</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(([source, metrics]) => (
                  <tr key={source}>
                    <td>{source}</td>
                    <td>{formatShares(metrics.shares)}</td>
                    <td>{formatCurrency(metrics.contributions)}</td>
                    <td>{formatCurrency(metrics.withdrawals)}</td>
                    <td>{formatCurrency(metrics.netInvested)}</td>
                    <td>{formatCurrency(metrics.marketValue)}</td>
                    <td className={metrics.gainLoss >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(metrics.gainLoss)}
                    </td>
                    <td className={metrics.roi >= 0 ? 'positive' : 'negative'}>
                      {formatPercent(metrics.roi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentTimeline.length > 0 && (
        <div className="summary-section">
          <h3>Recent Activity</h3>
          <div className="table-wrapper compact">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contributions</th>
                  <th>Withdrawals</th>
                  <th>Net</th>
                  <th>Running Total</th>
                </tr>
              </thead>
              <tbody>
                {recentTimeline.map(entry => (
                  <tr key={entry.date}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{formatCurrency(entry.contributions)}</td>
                    <td>{formatCurrency(entry.withdrawals)}</td>
                    <td className={entry.net >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(entry.net)}
                    </td>
                    <td>{formatCurrency(entry.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
