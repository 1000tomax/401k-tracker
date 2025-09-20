import React, { useMemo, useState } from 'react';
import {
  formatCurrency,
  formatShares,
  formatUnitPrice,
  formatPercent,
  formatFundName,
  formatSourceName,
} from '../utils/formatters.js';

const EPSILON = 1e-6;

export default function PortfolioTable({ portfolio, totals }) {
  const { allRows, activeRows } = useMemo(() => {
    const list = [];

    Object.entries(portfolio || {}).forEach(([fund, sources]) => {
      Object.entries(sources || {}).forEach(([source, metrics]) => {
        list.push({
          fund,
          source,
          displayFund: formatFundName(fund),
          displaySource: formatSourceName(source),
          ...metrics,
        });
      });
    });

    const active = list.filter(row => {
      const shares = Number.isFinite(row.shares) ? row.shares : 0;
      const marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
      return Math.abs(shares) > EPSILON || Math.abs(marketValue) > EPSILON;
    });

    return {
      allRows: list,
      activeRows: active,
    };
  }, [portfolio]);

  const closedCount = allRows.length - activeRows.length;
  const [showClosed, setShowClosed] = useState(false);
  const displayRows = showClosed || !activeRows.length ? allRows : activeRows;
  const canToggleClosed = closedCount > 0 && activeRows.length > 0;

  if (!displayRows.length) {
    return (
      <div className="empty-state">
        <p>No portfolio data yet. Paste transactions and press Update.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      {closedCount > 0 && (
        <div className="table-notice">
          <p className="meta">
            {showClosed || !activeRows.length
              ? 'Showing closed positions.'
              : `Hiding ${closedCount} closed position${closedCount === 1 ? '' : 's'}.`}
          </p>
          {canToggleClosed && (
            <button
              type="button"
              className="secondary"
              onClick={() => setShowClosed(prev => !prev)}
            >
              {showClosed ? 'Hide Closed Positions' : 'Show Closed Positions'}
            </button>
          )}
        </div>
      )}
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
          {displayRows.map(row => (
            <tr key={`${row.fund}-${row.source}`}>
              <td>{row.displayFund}</td>
              <td>{row.displaySource}</td>
              <td>{formatShares(row.shares)}</td>
              <td>{formatCurrency(row.costBasis)}</td>
              <td>{formatCurrency(row.avgCost)}</td>
              <td>{formatUnitPrice(row.latestNAV)}</td>
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
