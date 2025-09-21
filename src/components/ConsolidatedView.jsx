import React, { useMemo, useState } from 'react';
import SummaryOverview from './SummaryOverview.jsx';
import PortfolioTable from './PortfolioTable.jsx';
import TaxDiversificationChart from './TaxDiversificationChart.jsx';
import { formatCurrency, formatPercent } from '../utils/formatters.js';

function AllHoldingsTable({ holdings, livePrices, showLivePrices }) {
  const sortedHoldings = holdings.sort((a, b) => b.totalValue - a.totalValue);

  return (
    <div className="all-holdings-table">
      <h3>Consolidated Holdings</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Security</th>
              <th>Total Quantity</th>
              <th>Avg Price</th>
              {showLivePrices && <th>Live Price</th>}
              <th>Total Value</th>
              <th>Accounts</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => {
              const symbol = holding.symbol;
              const livePrice = livePrices[symbol];

              return (
                <tr key={index}>
                  <td>
                    <div className="security-info">
                      <span className="security-symbol">{symbol}</span>
                      <span className="security-name">{holding.name}</span>
                    </div>
                  </td>
                  <td>{holding.totalQuantity.toLocaleString()}</td>
                  <td>{formatCurrency(holding.avgPrice)}</td>
                  {showLivePrices && (
                    <td>
                      {livePrice ? (
                        <div className="live-price-display">
                          <span className="live-price-main">
                            {formatCurrency(livePrice.price)}
                          </span>
                          <span className={`live-price-change ${livePrice.change >= 0 ? 'positive' : 'negative'}`}>
                            {livePrice.change >= 0 ? '+' : ''}{formatCurrency(livePrice.change)}
                            ({livePrice.changePercent})
                          </span>
                        </div>
                      ) : (
                        <span className="no-live-price">—</span>
                      )}
                    </td>
                  )}
                  <td>{formatCurrency(holding.totalValue)}</td>
                  <td>
                    <div className="accounts-list">
                      {holding.accounts.slice(0, 3).map((acc, i) => (
                        <span key={i} className="account-tag">
                          {acc.accountKey.split('_')[0]}
                        </span>
                      ))}
                      {holding.accounts.length > 3 && (
                        <span className="account-more">+{holding.accounts.length - 3}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClosedHoldingsTable({ holdings }) {
  const sortedHoldings = holdings.sort((a, b) => {
    const aGain = a.totalRealizedGainLoss ?? ((a.totalValue || 0) - (a.totalCostBasis || 0));
    const bGain = b.totalRealizedGainLoss ?? ((b.totalValue || 0) - (b.totalCostBasis || 0));
    return bGain - aGain;
  });

  const summary = sortedHoldings.reduce((acc, holding) => {
    const gainLoss = holding.totalRealizedGainLoss ?? ((holding.totalValue || 0) - (holding.totalCostBasis || 0));
    acc.gainLoss += gainLoss;
    return acc;
  }, { gainLoss: 0 });

  return (
    <div className="closed-holdings-table">
      <h3>Closed Positions</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Security</th>
              <th>Accounts</th>
              <th>Gain / Loss</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => (
              <tr key={index}>
                <td>{holding.symbol || holding.name}</td>
                <td>
                  <div className="accounts-list">
                    {holding.accounts.slice(0, 3).map((acc, i) => (
                      <span key={i} className="account-tag">
                        {acc.accountKey.split('_')[0]}
                      </span>
                    ))}
                    {holding.accounts.length > 3 && (
                      <span className="account-more">+{holding.accounts.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className={(holding.totalRealizedGainLoss ?? 0) >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(holding.totalRealizedGainLoss ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>—</td>
              <td className={summary.gainLoss >= 0 ? 'positive' : 'negative'}>
                {formatCurrency(summary.gainLoss)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function ConsolidatedView({
  portfolioData,
  livePrices = {},
  marketStatus,
  onRefreshMarket,
  isRefreshingMarket
}) {
  const showLivePrices = Object.keys(livePrices).length > 0;

  const [showClosedHoldings, setShowClosedHoldings] = useState(false);

  const { activeHoldings, closedHoldings } = useMemo(() => {
    const holdings = portfolioData.allHoldingsArray || [];
    const active = holdings.filter(holding => !holding.isClosed);
    const closed = holdings.filter(holding => holding.isClosed);
    return { activeHoldings: active, closedHoldings: closed };
  }, [portfolioData.allHoldingsArray]);

  // Convert to legacy format for existing SummaryOverview component
  const legacyTotals = useMemo(() => ({
    marketValue: portfolioData.consolidatedTotals.totalValue,
    netInvested: portfolioData.consolidatedTotals.totalContributions,
    gainLoss: portfolioData.consolidatedTotals.totalEarnings,
    roi: portfolioData.consolidatedTotals.totalContributions > 0
      ? portfolioData.consolidatedTotals.totalEarnings / portfolioData.consolidatedTotals.totalContributions
      : 0,
    contributions: portfolioData.consolidatedTotals.totalContributions,
    shares: portfolioData.allHoldingsArray?.reduce((sum, h) => sum + h.totalQuantity, 0) || 0
  }), [portfolioData]);

  // Convert holdings for PortfolioTable (simplified aggregated view)
  const aggregatedPortfolio = useMemo(() => {
    const portfolio = {};

    portfolioData.allHoldingsArray?.forEach(holding => {
      const fundName = holding.name || holding.symbol;
      if (!portfolio[fundName]) {
        portfolio[fundName] = {};
      }

      // Aggregate across all accounts for this security
      portfolio[fundName]['All Accounts'] = {
        shares: holding.totalQuantity,
        costBasis: holding.totalCostBasis || 0,
        avgCost: holding.avgPrice,
        latestNAV: holding.avgPrice,
        marketValue: holding.totalValue,
        gainLoss: (holding.totalValue || 0) - (holding.totalCostBasis || 0),
        roi: holding.totalCostBasis ? ((holding.totalValue || 0) - holding.totalCostBasis) / holding.totalCostBasis : 0,
        isClosed: holding.isClosed
      };
    });

    return portfolio;
  }, [portfolioData]);

  return (
    <div className="consolidated-view">
      {/* Market Status Banner */}
      {marketStatus && showLivePrices && (
        <div className="section">
          <MarketStatusBanner
            marketStatus={marketStatus}
            onRefreshMarket={onRefreshMarket}
            isRefreshingMarket={isRefreshingMarket}
          />
        </div>
      )}

      {/* Overall Summary */}
      <section>
        <h2>Portfolio Summary</h2>
        <SummaryOverview
          totals={legacyTotals}
          firstTransaction={null}
          livePrices={livePrices}
          showLivePrices={showLivePrices}
        />
      </section>

      {/* Tax Diversification */}
      {portfolioData.assetAllocation?.taxDiversification && (
        <section>
          <h2>Tax Diversification</h2>
          <div className="tax-diversification-section">
            <TaxDiversificationChart
              data={portfolioData.assetAllocation.taxDiversification}
              totalValue={portfolioData.consolidatedTotals.totalValue}
            />
            <div className="tax-breakdown-details">
              <div className="tax-bucket">
                <div className="bucket-header">
                  <span className="bucket-icon">💰</span>
                  <span className="bucket-title">Pre-Tax (Traditional)</span>
                </div>
                <div className="bucket-value">
                  {formatCurrency(portfolioData.assetAllocation.taxDiversification.preTax.value)}
                </div>
                <div className="bucket-percentage">
                  {formatPercent(portfolioData.assetAllocation.taxDiversification.preTax.percentage)}
                </div>
                <div className="bucket-description">
                  401(k), Traditional IRA - Tax deferred growth
                </div>
              </div>

              <div className="tax-bucket">
                <div className="bucket-header">
                  <span className="bucket-icon">🌱</span>
                  <span className="bucket-title">Post-Tax (Roth)</span>
                </div>
                <div className="bucket-value">
                  {formatCurrency(portfolioData.assetAllocation.taxDiversification.postTax.value)}
                </div>
                <div className="bucket-percentage">
                  {formatPercent(portfolioData.assetAllocation.taxDiversification.postTax.percentage)}
                </div>
                <div className="bucket-description">
                  Roth IRA, Roth 401(k) - Tax-free growth
                </div>
              </div>

              <div className="tax-bucket">
                <div className="bucket-header">
                  <span className="bucket-icon">📈</span>
                  <span className="bucket-title">Taxable</span>
                </div>
                <div className="bucket-value">
                  {formatCurrency(portfolioData.assetAllocation.taxDiversification.taxable.value)}
                </div>
                <div className="bucket-percentage">
                  {formatPercent(portfolioData.assetAllocation.taxDiversification.taxable.percentage)}
                </div>
                <div className="bucket-description">
                  Brokerage accounts - Taxable gains
                </div>
              </div>

              {portfolioData.assetAllocation.taxDiversification.hsa.value > 0 && (
                <div className="tax-bucket">
                  <div className="bucket-header">
                    <span className="bucket-icon">⚡</span>
                    <span className="bucket-title">HSA</span>
                  </div>
                  <div className="bucket-value">
                    {formatCurrency(portfolioData.assetAllocation.taxDiversification.hsa.value)}
                  </div>
                  <div className="bucket-percentage">
                    {formatPercent(portfolioData.assetAllocation.taxDiversification.hsa.percentage)}
                  </div>
                  <div className="bucket-description">
                    Health Savings Account - Triple tax advantage
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Account Type Breakdown */}
      <section>
        <h2>Account Type Breakdown</h2>
        <div className="account-type-breakdown">
          {Object.entries(portfolioData.byAccountType).map(([accountType, data]) => (
            <div key={accountType} className="account-type-summary">
              <div className="type-header">
                <h3>{accountType.replace(/_/g, ' ').toUpperCase()}</h3>
                <span className="account-count">{data.accountCount} accounts</span>
              </div>
              <div className="type-metrics">
                <div className="metric">
                  <span className="metric-label">Total Value</span>
                  <span className="metric-value">{formatCurrency(data.totalValue)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Percentage</span>
                  <span className="metric-value">
                    {formatPercent(data.totalValue / portfolioData.consolidatedTotals.totalValue)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Aggregated Holdings */}
      {activeHoldings.length > 0 && (
        <section>
          <AllHoldingsTable
            holdings={activeHoldings}
            livePrices={livePrices}
            showLivePrices={showLivePrices}
          />
        </section>
      )}

      {closedHoldings.length > 0 && (
        <section className="closed-holdings-section">
          <div className="table-notice">
            <p className="meta">
              {showClosedHoldings
                ? 'Closed positions'
                : `Hide ${closedHoldings.length === 1 ? 'closed position' : `${closedHoldings.length} closed positions`}`}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowClosedHoldings(prev => !prev)}
            >
              {showClosedHoldings ? 'Hide Closed Positions' : 'Show Closed Positions'}
            </button>
          </div>
          {showClosedHoldings && (
            <ClosedHoldingsTable holdings={closedHoldings} />
          )}
        </section>
      )}

      {/* Traditional Portfolio View (fallback) */}
      {Object.keys(aggregatedPortfolio).length > 0 && (
        <section>
          <h2>Portfolio Holdings</h2>
          <PortfolioTable
            portfolio={aggregatedPortfolio}
            totals={legacyTotals}
            livePrices={livePrices}
            showLivePrices={showLivePrices}
          />
        </section>
      )}
    </div>
  );
}

// Market Status Banner Component (reused from Dashboard)
function MarketStatusBanner({ marketStatus, onRefreshMarket, isRefreshingMarket }) {
  if (!marketStatus) return null;

  const statusColor = marketStatus.isOpen ? 'positive' : 'neutral';
  const statusText = marketStatus.isOpen ? 'Market Open' : 'Market Closed';
  const timeText = marketStatus.isOpen
    ? `Closes at ${marketStatus.localCloseTime} ${marketStatus.timezone}`
    : `Opens at ${marketStatus.localOpenTime} ${marketStatus.timezone}`;

  return (
    <div className={`market-status-banner status-banner--${statusColor}`}>
      <div className="market-status-content">
        <span className="market-status-indicator">
          {marketStatus.isOpen ? '🟢' : '🔴'} {statusText}
        </span>
        <span className="market-status-time">{timeText}</span>
        {marketStatus.fallback && (
          <span className="market-status-fallback">(Estimated)</span>
        )}
      </div>
      <div className="market-status-actions">
        <button
          type="button"
          className="secondary small"
          onClick={onRefreshMarket}
          disabled={isRefreshingMarket}
        >
          {isRefreshingMarket ? 'Updating...' : 'Update Prices'}
        </button>
      </div>
    </div>
  );
}
