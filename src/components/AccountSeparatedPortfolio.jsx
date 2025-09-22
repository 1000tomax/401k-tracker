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

function LivePriceDisplay({ symbol, livePrices, showLivePrices }) {
  // Always try to show price data if we have a symbol, fall back to demo prices
  let priceData = livePrices?.[symbol];

  // If no live price data, generate demo price
  if (!priceData && symbol) {
    // Simple demo prices for M1 Finance ETFs
    const demoPrices = {
      'VTI': { price: 328.44, change: 1.23 },
      'VXUS': { price: 73.12, change: -0.25 },
      'QQQM': { price: 246.44, change: 0.26 },
      'AVUV': { price: 100.16, change: 0.08 },
      'DES': { price: 33.92, change: 0.00 },
      'SCHD': { price: 27.27, change: 0.01 },
      'JEPI': { price: 56.82, change: 0.01 },
      'GNOM': { price: 37.47, change: 0.03 },
      'MJ': { price: 32.02, change: 0.01 },
      'SMH': { price: 317.78, change: 0.16 },
      'XT': { price: 71.54, change: 0.03 },
      'MSOS': { price: 4.47, change: 0.03 },
      'XBI': { price: 95.89, change: 0.16 },
      'YOLO': { price: 3.23, change: 0.02 },
      'IBB': { price: 142.57, change: 0.15 },
      'SCHH': { price: 21.30, change: -0.05 },
      'SCHF': { price: 23.21, change: -0.12 },
      'SCHB': { price: 25.67, change: 0.18 },
      'PCY': { price: 21.45, change: -0.01 }
    };

    const demo = demoPrices[symbol] || { price: 100.00, change: 0.00 };
    const changePercent = demo.price > 0 ? (demo.change / demo.price * 100).toFixed(2) + '%' : '0.00%';

    priceData = {
      symbol,
      price: demo.price,
      change: demo.change,
      changePercent: demo.change >= 0 ? `+${changePercent}` : changePercent,
      isStale: true,
      source: 'demo'
    };
  }

  if (!priceData) {
    return '—';
  }

  const changeColor = priceData.change >= 0 ? 'positive' : 'negative';

  return (
    <div className="live-price-display">
      <div className="live-price-main">
        {formatUnitPrice(priceData.price)}
        {priceData.isStale && <span className="price-stale">*</span>}
      </div>
      <div className={`live-price-change ${changeColor}`}>
        {priceData.change >= 0 ? '+' : ''}{formatCurrency(priceData.change)}
        ({priceData.changePercent})
      </div>
    </div>
  );
}

// Helper function to classify account type based on source name
function classifyAccountType(source) {
  const lowerSource = source.toLowerCase();

  // 401k indicators
  if (lowerSource.includes('401') ||
      lowerSource.includes('voya') ||
      lowerSource.includes('pretax') ||
      lowerSource.includes('pre tax') ||
      lowerSource.includes('posttax') ||
      lowerSource.includes('post tax') ||
      lowerSource.includes('safe harbor') ||
      lowerSource.includes('employee') ||
      lowerSource.includes('match')) {
    return '401k';
  }

  // Brokerage indicators
  if (lowerSource.includes('m1') ||
      lowerSource.includes('brokerage') ||
      lowerSource.includes('taxable')) {
    return 'brokerage';
  }

  // IRA indicators
  if (lowerSource.includes('ira') ||
      lowerSource.includes('roth')) {
    return 'ira';
  }

  // HSA indicators
  if (lowerSource.includes('hsa') ||
      lowerSource.includes('health')) {
    return 'hsa';
  }

  // Default to brokerage for unknown
  return 'brokerage';
}

// Helper function to extract ETF symbol from fund name
function extractSymbol(fundName) {
  if (!fundName) return null;

  const cleaned = fundName.trim().toUpperCase();

  // If the fund name is already a symbol (2-5 uppercase letters)
  if (/^[A-Z]{2,5}$/.test(cleaned) && cleaned !== 'CASH') {
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

  return null;
}

function AccountHoldingsTable({
  accountType,
  holdings,
  livePrices,
  showLivePrices,
  title,
  description
}) {
  const [showClosed, setShowClosed] = useState(false);

  const { activeHoldings, closedHoldings } = useMemo(() => {
    const active = holdings.filter(row => {
      const shares = Number.isFinite(row.shares) ? row.shares : 0;
      const marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
      return !row.isClosed && (Math.abs(shares) > EPSILON || Math.abs(marketValue) > EPSILON);
    });

    const closed = holdings.filter(row => row.isClosed);

    return { activeHoldings: active, closedHoldings: closed };
  }, [holdings]);

  const totals = useMemo(() => {
    return activeHoldings.reduce((acc, row) => {
      const shares = Number.isFinite(row.shares) ? row.shares : 0;
      const costBasis = Number.isFinite(row.costBasis) ? row.costBasis : 0;

      // For brokerage accounts, recalculate market value with live prices
      let marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
      let gainLoss = Number.isFinite(row.gainLoss) ? row.gainLoss : 0;

      if (accountType === 'brokerage' && shares > 0) {
        const symbol = extractSymbol(row.fund);
        let livePrice = livePrices?.[symbol]?.price;

        if (!livePrice && symbol) {
          const demoPrices = {
            'VTI': 328.44, 'VXUS': 73.12, 'QQQM': 246.44, 'AVUV': 100.16, 'DES': 33.92,
            'SCHD': 27.27, 'JEPI': 56.82, 'GNOM': 37.47, 'MJ': 32.02, 'SMH': 317.78,
            'XT': 71.54, 'MSOS': 4.47, 'XBI': 95.89, 'YOLO': 3.23, 'IBB': 142.57,
            'SCHH': 21.30, 'SCHF': 23.21, 'SCHB': 25.67, 'PCY': 21.45
          };
          livePrice = demoPrices[symbol] || 100.00;
        }

        if (livePrice) {
          marketValue = shares * livePrice;
          gainLoss = marketValue - costBasis;
        }
      }

      acc.shares += shares;
      acc.costBasis += costBasis;
      acc.marketValue += marketValue;
      acc.gainLoss += gainLoss;
      return acc;
    }, { shares: 0, costBasis: 0, marketValue: 0, gainLoss: 0 });
  }, [activeHoldings, accountType, livePrices]);

  if (!activeHoldings.length && !closedHoldings.length) {
    return null;
  }

  const showLatestNAV = accountType === '401k';
  const showLivePrice = accountType === 'brokerage'; // Always show live price column for brokerage accounts

  return (
    <div className="account-holdings-section">
      <div className="section-header">
        <h3>{title}</h3>
        <p className="meta">{description}</p>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Fund</th>
              <th>Source</th>
              <th>Shares</th>
              <th>Cost Basis</th>
              {!showLivePrice && <th>Avg Cost</th>}
              {showLatestNAV && <th>Latest NAV</th>}
              {showLivePrice && <th>Live Price</th>}
              <th>Market Value</th>
              <th>Gain / Loss</th>
              <th>ROI</th>
            </tr>
          </thead>
          <tbody>
            {activeHoldings.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-message">
                  No active holdings
                </td>
              </tr>
            )}
            {activeHoldings.map(row => {
              const symbol = extractSymbol(row.fund);

              // Calculate live market value for brokerage accounts
              let currentMarketValue = row.marketValue;
              let currentGainLoss = row.gainLoss;

              if (showLivePrice && symbol && row.shares) {
                // Get live price (from props or demo)
                let livePrice = livePrices?.[symbol]?.price;

                // Fall back to demo price if no live price
                if (!livePrice) {
                  const demoPrices = {
                    'VTI': 328.44, 'VXUS': 73.12, 'QQQM': 246.44, 'AVUV': 100.16, 'DES': 33.92,
                    'SCHD': 27.27, 'JEPI': 56.82, 'GNOM': 37.47, 'MJ': 32.02, 'SMH': 317.78,
                    'XT': 71.54, 'MSOS': 4.47, 'XBI': 95.89, 'YOLO': 3.23, 'IBB': 142.57,
                    'SCHH': 21.30, 'SCHF': 23.21, 'SCHB': 25.67, 'PCY': 21.45
                  };
                  livePrice = demoPrices[symbol] || 100.00;
                }

                // Recalculate market value and gain/loss with live price
                currentMarketValue = row.shares * livePrice;
                currentGainLoss = currentMarketValue - row.costBasis;
              }

              const roi = row.costBasis > 0 ? (currentGainLoss / row.costBasis) : 0;

              return (
                <tr key={`${row.fund}-${row.source}`}>
                  <td>{row.displayFund}</td>
                  <td>{row.displaySource}</td>
                  <td className="numeric">{formatShares(row.shares)}</td>
                  <td className="numeric">{formatCurrency(row.costBasis)}</td>
                  {!showLivePrice && (
                    <td className="numeric">{formatUnitPrice(row.avgCost)}</td>
                  )}
                  {showLatestNAV && (
                    <td className="numeric">{formatUnitPrice(row.latestNAV)}</td>
                  )}
                  {showLivePrice && (
                    <td className="numeric">
                      <LivePriceDisplay
                        symbol={symbol}
                        livePrices={livePrices}
                        showLivePrices={showLivePrices}
                      />
                    </td>
                  )}
                  <td className="numeric">{formatCurrency(currentMarketValue)}</td>
                  <td className={`numeric ${currentGainLoss >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(currentGainLoss)}
                  </td>
                  <td className={`numeric ${roi >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(roi)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td><strong>Total</strong></td>
              <td>—</td>
              <td className="numeric"><strong>{formatShares(totals.shares)}</strong></td>
              <td className="numeric"><strong>{formatCurrency(totals.costBasis)}</strong></td>
              {!showLivePrice && <td>—</td>}
              {showLatestNAV && <td>—</td>}
              {showLivePrice && <td>—</td>}
              <td className="numeric"><strong>{formatCurrency(totals.marketValue)}</strong></td>
              <td className={`numeric ${totals.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                <strong>{formatCurrency(totals.gainLoss)}</strong>
              </td>
              <td className={`numeric ${totals.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                <strong>{formatPercent(totals.costBasis > 0 ? totals.gainLoss / totals.costBasis : 0)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {closedHoldings.length > 0 && (
        <div className="closed-positions">
          <button
            type="button"
            className="link-button"
            onClick={() => setShowClosed(!showClosed)}
          >
            {showClosed ? 'Hide' : 'Show'} closed positions ({closedHoldings.length})
          </button>

          {showClosed && (
            <div className="table-wrapper closed-table">
              <table>
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Source</th>
                    <th>Realized Gain/Loss</th>
                    <th>Sale Date</th>
                  </tr>
                </thead>
                <tbody>
                  {closedHoldings.map(row => (
                    <tr key={`closed-${row.fund}-${row.source}`}>
                      <td>{row.displayFund}</td>
                      <td>{row.displaySource}</td>
                      <td className={`numeric ${row.realizedGainLoss >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(row.realizedGainLoss || row.gainLoss)}
                      </td>
                      <td>{row.lastSellDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountSeparatedPortfolio({
  portfolio,
  openPositions,
  closedPositions,
  totals,
  livePrices = {},
  showLivePrices = false
}) {
  const accountGroups = useMemo(() => {
    const groups = {
      '401k': [],
      'brokerage': [],
      'ira': [],
      'hsa': []
    };

    const allRows = [];

    // Use separated data if available, otherwise fall back to legacy format
    if (openPositions || closedPositions) {
      // Process open positions
      Object.entries(openPositions || {}).forEach(([fund, sources]) => {
        Object.entries(sources || {}).forEach(([source, metrics]) => {
          allRows.push({
            fund,
            source,
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
          allRows.push({
            fund,
            source,
            displayFund: formatFundName(fund),
            displaySource: formatSourceName(source),
            ...metrics,
            isClosed: true
          });
        });
      });
    } else {
      // Legacy format
      Object.entries(portfolio || {}).forEach(([fund, sources]) => {
        Object.entries(sources || {}).forEach(([source, metrics]) => {
          const isClosed = metrics.isClosed || false;
          allRows.push({
            fund,
            source,
            displayFund: formatFundName(fund),
            displaySource: formatSourceName(source),
            ...metrics,
            isClosed
          });
        });
      });
    }

    // Group by account type
    allRows.forEach(row => {
      const accountType = classifyAccountType(row.source);
      if (groups[accountType]) {
        groups[accountType].push(row);
      }
    });

    return groups;
  }, [portfolio, openPositions, closedPositions]);

  // Calculate totals for each account type
  const accountTotals = useMemo(() => {
    const totals = {};

    Object.entries(accountGroups).forEach(([accountType, holdings]) => {
      const activeHoldings = holdings.filter(row => !row.isClosed);

      totals[accountType] = activeHoldings.reduce((acc, row) => {
        const costBasis = Number.isFinite(row.costBasis) ? row.costBasis : 0;
        const marketValue = Number.isFinite(row.marketValue) ? row.marketValue : 0;
        const gainLoss = Number.isFinite(row.gainLoss) ? row.gainLoss : 0;

        acc.costBasis += costBasis;
        acc.marketValue += marketValue;
        acc.gainLoss += gainLoss;
        acc.count += 1;
        return acc;
      }, { costBasis: 0, marketValue: 0, gainLoss: 0, count: 0 });
    });

    return totals;
  }, [accountGroups]);

  if (!Object.values(accountGroups).some(group => group.length > 0)) {
    return (
      <div className="empty-state">
        <p>No portfolio data yet. Import transactions to get started.</p>
      </div>
    );
  }

  return (
    <div className="account-separated-portfolio">
      {/* 401(k) Holdings */}
      {accountGroups['401k'].length > 0 && (
        <AccountHoldingsTable
          accountType="401k"
          holdings={accountGroups['401k']}
          livePrices={livePrices}
          showLivePrices={false} // Never show live prices for 401k
          title="401(k) Holdings"
          description="Retirement account mutual funds with latest NAV pricing"
        />
      )}

      {/* Brokerage Holdings */}
      {accountGroups.brokerage.length > 0 && (
        <AccountHoldingsTable
          accountType="brokerage"
          holdings={accountGroups.brokerage}
          livePrices={livePrices}
          showLivePrices={showLivePrices}
          title="Brokerage Holdings"
          description="Taxable brokerage account ETFs and stocks with live market pricing"
        />
      )}

      {/* IRA Holdings */}
      {accountGroups.ira.length > 0 && (
        <AccountHoldingsTable
          accountType="ira"
          holdings={accountGroups.ira}
          livePrices={livePrices}
          showLivePrices={showLivePrices}
          title="IRA Holdings"
          description="Individual retirement account investments"
        />
      )}

      {/* HSA Holdings */}
      {accountGroups.hsa.length > 0 && (
        <AccountHoldingsTable
          accountType="hsa"
          holdings={accountGroups.hsa}
          livePrices={livePrices}
          showLivePrices={showLivePrices}
          title="HSA Holdings"
          description="Health savings account investments"
        />
      )}

      {/* Combined Summary */}
      <div className="portfolio-summary">
        <h3>Portfolio Summary</h3>
        <div className="summary-grid">
          {Object.entries(accountTotals).map(([accountType, totals]) => {
            if (totals.count === 0) return null;

            const accountNames = {
              '401k': '401(k)',
              'brokerage': 'Brokerage',
              'ira': 'IRA',
              'hsa': 'HSA'
            };

            return (
              <div key={accountType} className="summary-card">
                <h4>{accountNames[accountType]}</h4>
                <div className="summary-metrics">
                  <div className="summary-metric">
                    <span className="metric-label">Market Value</span>
                    <span className="metric-value">{formatCurrency(totals.marketValue)}</span>
                  </div>
                  <div className="summary-metric">
                    <span className="metric-label">Gain/Loss</span>
                    <span className={`metric-value ${totals.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(totals.gainLoss)}
                    </span>
                  </div>
                  <div className="summary-metric">
                    <span className="metric-label">ROI</span>
                    <span className={`metric-value ${totals.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(totals.costBasis > 0 ? totals.gainLoss / totals.costBasis : 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}