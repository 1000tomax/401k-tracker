import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatCurrency,
  formatShares,
  formatUnitPrice,
  formatPercent,
  formatFundName,
  formatSourceName,
} from '../utils/formatters.js';

const EPSILON = 1e-6;

function LivePriceDisplay({ symbol, livePrices, showLivePrices }) {
  if (!showLivePrices || !livePrices[symbol]) {
    return null;
  }

  const priceData = livePrices[symbol];
  const changeColor = priceData.change >= 0 ? 'positive' : 'negative';
  const changePercent = priceData.changePercent;

  return (
    <div className="live-price-display">
      <div className="live-price-main">
        {formatUnitPrice(priceData.price)}
        {priceData.isStale && <span className="price-stale">*</span>}
      </div>
      <div className={`live-price-change ${changeColor}`}>
        {priceData.change >= 0 ? '+' : ''}{formatCurrency(priceData.change)}
        ({changePercent})
      </div>
    </div>
  );
}

export default function PortfolioTable({
  portfolio,
  openPositions,
  closedPositions,
  openPositionsTotals,
  closedPositionsTotals,
  totals,
  livePrices = {},
  showLivePrices = false
}) {
  // Helper function to extract symbol from fund name
  const extractSymbol = (fundName) => {
    if (!fundName) return null;

    const cleaned = fundName.trim().toUpperCase();

    // If the fund name is already a symbol (2-5 uppercase letters)
    if (/^[A-Z]{2,5}$/.test(cleaned)) {
      return cleaned;
    }

    // Try to extract from patterns like "Fund Name (SYMBOL)" or "SYMBOL - Fund Name"
    const patterns = [
      /\(([A-Z]{2,5})\)/,  // Symbol in parentheses
      /^([A-Z]{2,5})\s*[-:]/,  // Symbol at start followed by dash or colon
      /\b([A-Z]{2,5})\b/   // Any 2-5 letter symbol as a word
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fallback: remove non-alphanumeric and check if it looks like a symbol
    const fallback = cleaned.replace(/[^A-Z0-9]/g, '');
    return fallback.length >= 2 && fallback.length <= 5 ? fallback : null;
  };

  const { allRows, activeRows, closedRows } = useMemo(() => {
    const list = [];

    // Use separated data if available, otherwise fall back to legacy format
    if (openPositions || closedPositions) {
      // Process open positions
      Object.entries(openPositions || {}).forEach(([fund, sources]) => {
        Object.entries(sources || {}).forEach(([source, metrics]) => {
          const symbol = extractSymbol(fund);
          list.push({
            fund,
            source,
            symbol,
            displayFund: formatFundName(fund),
            displaySource: formatSourceName(source),
            ...metrics,
            isClosed: false
          });
        });
      });

      // Process closed positions
      Object.entries(closedPositions || {}).forEach(([fund, sources]) => {
        Object.entries(sources || {}).forEach(([source, metrics]) => {
          const symbol = extractSymbol(fund);
          list.push({
            fund,
            source,
            symbol,
            displayFund: formatFundName(fund),
            displaySource: formatSourceName(source),
            ...metrics,
            isClosed: true
          });
        });
      });
    } else {
      // Legacy format - process all positions and filter by isClosed flag
      Object.entries(portfolio || {}).forEach(([fund, sources]) => {
        Object.entries(sources || {}).forEach(([source, metrics]) => {
          const symbol = extractSymbol(fund);
          const isClosed = metrics.isClosed || false;
          list.push({
            fund,
            source,
            symbol,
            displayFund: formatFundName(fund),
            displaySource: formatSourceName(source),
            ...metrics,
            isClosed
          });
        });
      });
    }

    const active = list.filter(row => {
      const shares = Number.isFinite(row.shares) ? row.shares : 0;
      const marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
      return !row.isClosed && (Math.abs(shares) > EPSILON || Math.abs(marketValue) > EPSILON);
    });

    const closed = list.filter(row => row.isClosed);

    return {
      allRows: list,
      activeRows: active,
      closedRows: closed,
    };
  }, [portfolio, openPositions, closedPositions]);

  const closedCount = allRows.length - activeRows.length;
  const [showClosed, setShowClosed] = useState(false);

  const activeTotals = useMemo(() => {
    return activeRows.reduce((acc, row) => {
      const shares = Number.isFinite(row.shares) ? row.shares : 0;
      const costBasis = Number.isFinite(row.costBasis) ? row.costBasis : 0;
      const marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
      const gainLoss = Number.isFinite(row.gainLoss) ? row.gainLoss : 0;

      acc.shares += shares;
      acc.costBasis += costBasis;
      acc.marketValue += marketValue;
      acc.gainLoss += gainLoss;
      return acc;
    }, { shares: 0, costBasis: 0, marketValue: 0, gainLoss: 0 });
  }, [activeRows]);

  const closedSummary = useMemo(() => {
    return closedRows.reduce((acc, row) => {
      const realized = row.realizedGainLoss ?? row.gainLoss;
      const gainLoss = Number.isFinite(realized) ? realized : 0;
      acc.gainLoss += gainLoss;
      return acc;
    }, { gainLoss: 0 });
  }, [closedRows]);

  if (!allRows.length) {
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
            {showLivePrices && <th>Live Price</th>}
            <th>Market Value</th>
            <th>Gain / Loss</th>
            <th>ROI</th>
          </tr>
        </thead>
        <tbody>
          {activeRows.length === 0 && (
            <tr>
              <td colSpan={showLivePrices ? 10 : 9} className="empty">
                No open positions.
              </td>
            </tr>
          )}
          {activeRows.map(row => (
            <tr key={`${row.fund}-${row.source}`}
              className={row.isClosed ? 'row-closed' : ''}
            >
              <td>
                {row.symbol ? (
                  <Link to={`/fund/${row.symbol}`} className="fund-link">
                    {row.displayFund}
                  </Link>
                ) : (
                  row.displayFund
                )}
                {showLivePrices && row.symbol && (
                  <div className="symbol-indicator">({row.symbol})</div>
                )}
              </td>
              <td>{row.displaySource}</td>
              <td>{formatShares(row.shares)}</td>
              <td>{formatCurrency(row.costBasis)}</td>
              <td>{formatCurrency(row.avgCost)}</td>
              <td>{formatUnitPrice(row.latestNAV)}</td>
              {showLivePrices && (
                <td>
                  {row.symbol ? (
                    <LivePriceDisplay
                      symbol={row.symbol}
                      livePrices={livePrices}
                      showLivePrices={showLivePrices}
                    />
                  ) : (
                    <span className="no-symbol">—</span>
                  )}
                </td>
              )}
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
          {activeRows.length > 0 && (
            <tr>
              <td>Total</td>
              <td>—</td>
              <td>{formatShares(activeTotals.shares)}</td>
              <td>{formatCurrency(activeTotals.costBasis)}</td>
              <td>—</td>
              <td>—</td>
              {showLivePrices && <td>—</td>}
              <td>{formatCurrency(activeTotals.marketValue)}</td>
              <td className={activeTotals.gainLoss >= 0 ? 'positive' : 'negative'}>
                {formatCurrency(activeTotals.gainLoss)}
              </td>
              <td className={activeTotals.gainLoss >= 0 ? 'positive' : 'negative'}>
                {formatPercent(activeTotals.costBasis ? activeTotals.gainLoss / activeTotals.costBasis : 0)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {closedRows.length > 0 && (
        <div className="closed-positions">
          <div className="table-notice">
            <div className="closed-header">
              <h3>Closed Positions</h3>
              <p className="meta">
                {closedRows.length === 1
                  ? '1 position with realized gains/losses'
                  : `${closedRows.length} positions with realized gains/losses`}
              </p>
            </div>
            <div className="closed-summary">
              <span className="summary-label">Total Realized:</span>
              <span className={`summary-value ${closedSummary.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(closedSummary.gainLoss)}
              </span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowClosed(prev => !prev)}
            >
              {showClosed ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {showClosed && (
            <table className="closed-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th>Source</th>
                  <th>Realized Gain / Loss</th>
                  {closedRows.some(row => row.firstBuyDate) && <th>Held Period</th>}
                </tr>
              </thead>
              <tbody>
                {closedRows.map(row => {
                  const realizedGainLoss = row.realizedGainLoss ?? row.gainLoss;
                  const hasDateInfo = row.firstBuyDate && row.lastSellDate;

                  return (
                    <tr key={`${row.fund}-${row.source}`} className="closed-row">
                      <td>{row.displayFund}</td>
                      <td>{row.displaySource}</td>
                      <td className={realizedGainLoss >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(realizedGainLoss)}
                      </td>
                      {closedRows.some(r => r.firstBuyDate) && (
                        <td className="date-range">
                          {hasDateInfo
                            ? `${row.firstBuyDate} to ${row.lastSellDate}`
                            : '—'
                          }
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td><strong>Total Realized</strong></td>
                  <td>—</td>
                  <td className={`total-value ${closedSummary.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                    <strong>{formatCurrency(closedSummary.gainLoss)}</strong>
                  </td>
                  {closedRows.some(row => row.firstBuyDate) && <td>—</td>}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
