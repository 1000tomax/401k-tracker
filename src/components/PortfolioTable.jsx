import React from 'react';
import {
  formatCurrency,
  formatShares,
  formatPercent,
  formatFundName,
  formatSourceName,
} from '../utils/formatters.js';

export default function PortfolioTable({ portfolio, totals }) {
  const rows = [];

  Object.entries(portfolio).forEach(([fund, sources]) => {
    Object.entries(sources).forEach(([source, metrics]) => {
      rows.push({
        fund,
        source,
        displayFund: formatFundName(fund),
        displaySource: formatSourceName(source),
        ...metrics,
      });
    });
  });

  if (!rows.length) {
    return (
      <div className="empty-state">
        <p>No portfolio data yet. Paste transactions and press Update.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Fund</th>
            <th>Source</th>
            <th>Shares</th>
            <th>Cost Basis</th>
            <th>Avg Cost</th>
            <th>Latest NAV</th>
            <th>Market Value</th>
            <th>Gain / Loss</th>
            <th>ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.fund}-${row.source}`}>
              <td>{row.displayFund}</td>
              <td>{row.displaySource}</td>
              <td>{formatShares(row.shares)}</td>
              <td>{formatCurrency(row.costBasis)}</td>
              <td>{formatCurrency(row.avgCost)}</td>
              <td>{formatCurrency(row.latestNAV)}</td>
              <td>{formatCurrency(row.marketValue)}</td>
              <td className={row.gainLoss >= 0 ? 'positive' : 'negative'}>
                {formatCurrency(row.gainLoss)}
              </td>
              <td className={row.gainLoss >= 0 ? 'positive' : 'negative'}>
                {formatPercent(row.roi)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>—</td>
            <td>{formatShares(totals.shares)}</td>
            <td>{formatCurrency(totals.costBasis)}</td>
            <td>—</td>
            <td>—</td>
            <td>{formatCurrency(totals.marketValue)}</td>
            <td className={totals.gainLoss >= 0 ? 'positive' : 'negative'}>
              {formatCurrency(totals.gainLoss)}
            </td>
            <td className={totals.gainLoss >= 0 ? 'positive' : 'negative'}>
              {formatPercent(totals.costBasis ? totals.gainLoss / totals.costBasis : 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
