import React, { useMemo, useState, useEffect, useCallback } from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import {
  formatCurrency,
  formatDate,
  formatFundName,
  formatSourceName,
  formatShares,
  formatUnitPrice,
} from '../utils/formatters.js';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import MarketDataService from '../services/MarketDataService.js';

export default function Dashboard({
  summary,
  transactions,
  onSync,
  isSyncing,
  syncStatus,
  remoteStatus,
  onRefresh,
  isRefreshing,
}) {
  const [livePrices, setLivePrices] = useState({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [marketStatus, setMarketStatus] = useState(null);
  const [showLivePrices, setShowLivePrices] = useState(false);
  const remoteTone = remoteStatus?.toLowerCase().includes('failed') ? 'error' : 'info';
  const syncTone = syncStatus?.toLowerCase().includes('failed') ? 'error' : 'success';
  const baseTrend = (summary.timeline || []).map(entry => ({
    date: entry.date,
    marketValue: entry.marketValue ?? 0,
    contributed: entry.investedBalance ?? 0,
  }));

  // Enhanced data with recent sample data
  const sampleData = [
    { date: '2024-01-01', marketValue: 45000, contributed: 42000 },
    { date: '2024-03-01', marketValue: 52000, contributed: 45000 },
    { date: '2024-06-01', marketValue: 58000, contributed: 50000 },
    { date: '2024-09-01', marketValue: 64000, contributed: 55000 },
    { date: '2024-12-01', marketValue: 71000, contributed: 60000 },
  ];

  const trendData = useMemo(() => {
    if (baseTrend.length >= 3) return baseTrend;
    return [...sampleData, ...baseTrend].slice(-12);
  }, [baseTrend]);

  const usingSampleData = baseTrend.length < 3;

  const formattedTrend = trendData.map(point => ({
    ...point,
    label: formatDate(point.date),
    marketValueShade: point.marketValue,
  }));

  const axisLabel = usingSampleData ? 'Sample Balance' : 'Account Value';

  const tickFormatter = value => {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  const [expandedDate, setExpandedDate] = useState(null);

  const handleToggleDetails = date => {
    setExpandedDate(prev => (prev === date ? null : date));
  };

  // Extract ETF symbols from portfolio holdings
  const etfSymbols = useMemo(() => {
    const symbols = new Set();

    // Look for ETF-like symbols in fund names
    Object.keys(summary.portfolio || {}).forEach(fund => {
      const cleanName = fund.toUpperCase();

      // Common ETF patterns
      const etfPatterns = [
        /\b(VTI|VXUS|VEA|VWO|BND|VB|SPY|QQQ|IWM|EFA)\b/,
        /\b[A-Z]{2,5}\b/  // 2-5 letter symbols
      ];

      etfPatterns.forEach(pattern => {
        const matches = cleanName.match(pattern);
        if (matches) {
          matches.forEach(match => symbols.add(match));
        }
      });
    });

    return Array.from(symbols);
  }, [summary.portfolio]);

  // Fetch live prices for detected ETF symbols
  const fetchLivePrices = useCallback(async () => {
    if (etfSymbols.length === 0) return;

    setIsLoadingPrices(true);
    try {
      const prices = await MarketDataService.getBatchPrices(etfSymbols);
      setLivePrices(prices);
      setShowLivePrices(Object.keys(prices).length > 0);

      // Update market status
      const status = MarketDataService.getMarketStatus();
      setMarketStatus(status);
    } catch (error) {
      console.error('Failed to fetch live prices:', error);
    } finally {
      setIsLoadingPrices(false);
    }
  }, [etfSymbols]);

  // Initial price fetch and periodic updates
  useEffect(() => {
    fetchLivePrices();

    // Auto-refresh during market hours
    const interval = setInterval(() => {
      const status = MarketDataService.getMarketStatus();
      if (status.isOpen) {
        fetchLivePrices();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [fetchLivePrices]);

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) {
      return null;
    }
    const filtered = payload.filter(item => item.dataKey !== 'marketValueShade');
    if (!filtered.length) {
      return null;
    }

    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        <ul>
          {filtered.map(item => (
            <li key={item.dataKey}>
              <span className="dot" style={{ background: item.color || item.stroke }} />
              <span className="name">
                {item.dataKey === 'contributed' ? 'Total contributions' : 'Market value'}
              </span>
              <span className="value">{formatCurrency(item.value ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <section>
        <div className="section-header">
          <h2>Account Overview</h2>
          <div className="section-actions">
            {etfSymbols.length > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={fetchLivePrices}
                disabled={isLoadingPrices}
              >
                {isLoadingPrices ? 'Updating…' : 'Update Prices'}
              </button>
            )}
            {onRefresh && (
              <button type="button" className="secondary" onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? 'Refreshing…' : 'Refresh from GitHub'}
              </button>
            )}
            <button type="button" className="primary" onClick={onSync} disabled={isSyncing || !transactions.length}>
              {isSyncing ? 'Syncing…' : 'Sync to GitHub'}
            </button>
          </div>
        </div>

        {remoteStatus && <div className={`status-banner status-banner--${remoteTone}`}>{remoteStatus}</div>}
        {syncStatus && <div className={`status-banner status-banner--${syncTone}`}>{syncStatus}</div>}

        {/* Market Status Banner */}
        {marketStatus && showLivePrices && (
          <div className={`status-banner status-banner--${marketStatus.isOpen ? 'success' : 'info'}`}>
            <div className="market-status-content">
              <span className="market-status-indicator">
                {marketStatus.isOpen ? '🟢' : '🔴'} {marketStatus.isOpen ? 'Market Open' : 'Market Closed'}
              </span>
              <span className="market-status-time">
                {marketStatus.isOpen
                  ? `Closes at ${marketStatus.localCloseTime} ${marketStatus.timezone}`
                  : `Opens at ${marketStatus.localOpenTime} ${marketStatus.timezone}`}
              </span>
              {Object.keys(livePrices).length > 0 && (
                <span className="price-count">
                  Live prices for {Object.keys(livePrices).length} ETF{Object.keys(livePrices).length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        )}

        {!transactions.length && <p className="meta">No transactions stored yet. Visit the Import page to get started.</p>}
        <SummaryOverview
          totals={summary.totals}
          firstTransaction={summary.firstTransaction}
        />
      </section>

      {trendData.length ? (
        <section className="chart-section">
          <div className="section-header">
            <h2>Account Growth</h2>
            <p className="meta">Compare market value against cumulative net contributions across your history.</p>
          </div>
          <div className="chart-panel">
            {usingSampleData && (
              <p className="chart-demo-note">Showing sample data until more transactions are imported locally.</p>
            )}
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={formattedTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(129, 140, 248, 0.85)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="rgba(99, 102, 241, 0.05)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="rgba(203, 213, 225, 0.65)"
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                    minTickGap={32}
                  />
                  <YAxis
                    dataKey="marketValue"
                    stroke="rgba(203, 213, 225, 0.65)"
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                    tickFormatter={tickFormatter}
                    width={90}
                    label={{
                      value: axisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      fill: 'rgba(203, 213, 225, 0.75)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <Tooltip content={renderTooltip} />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    payload={[
                      { value: 'Market value', type: 'line', color: 'rgba(99, 102, 241, 0.95)' },
                      { value: 'Total contributions', type: 'line', color: '#f97316' }
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="marketValueShade"
                    stroke="rgba(129, 140, 248, 0.35)"
                    strokeWidth={1}
                    fill="url(#balanceTrendGradient)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="marketValue"
                    name="Market value"
                    stroke="rgba(99, 102, 241, 0.95)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: 'rgba(99, 102, 241, 0.95)' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="contributed"
                    name="Total contributions"
                    stroke="#f97316"
                    strokeDasharray="6 3"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#f97316' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <PortfolioTable
          portfolio={summary.portfolio}
          openPositions={summary.openPositions}
          closedPositions={summary.closedPositions}
          openPositionsTotals={summary.openPositionsTotals}
          closedPositionsTotals={summary.closedPositionsTotals}
          totals={summary.totals}
          livePrices={livePrices}
          showLivePrices={showLivePrices}
        />
      </section>

      {/* Recent Activity */}
      {summary.timeline?.length ? (
        <section>
          <div className="section-header">
            <h2>Recent Activity</h2>
            <p className="meta">Last few updates to your account balance.</p>
          </div>
          <div className="recent-table-wrapper">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Market Value</th>
                  <th>Net Invested</th>
                  <th>Daily Change</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {summary.timeline
                  .slice(-10)
                  .reverse()
                  .map(entry => (
                    <React.Fragment key={entry.date}>
                      <tr>
                        <td>{formatDate(entry.date)}</td>
                        <td className="numeric">{formatCurrency(entry.marketValue)}</td>
                        <td className="numeric">{formatCurrency(entry.investedBalance)}</td>
                        <td className="numeric">
                          {entry.dailyChange !== undefined && entry.dailyChange !== 0 ? (
                            <span className={entry.dailyChange >= 0 ? 'positive' : 'negative'}>
                              {entry.dailyChange >= 0 ? '+' : ''}
                              {formatCurrency(entry.dailyChange)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {entry.transactions?.length ? (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleToggleDetails(entry.date)}
                            >
                              {expandedDate === entry.date ? 'Hide' : 'View'}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedDate === entry.date && entry.transactions?.length ? (
                        <tr className="recent-details">
                          <td colSpan={5}>
                            <div className="recent-details-wrapper">
                              <table className="recent-details-table">
                                <thead>
                                  <tr>
                                    <th>Fund</th>
                                    <th>Source</th>
                                    <th>Activity</th>
                                    <th>Shares</th>
                                    <th>Unit Price</th>
                                    <th>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.transactions.map(tx => (
                                    <tr
                                      key={`${tx.date}-${tx.fund}-${tx.moneySource}-${tx.activity}-${tx.units}-${tx.amount}`}
                                    >
                                      <td>{formatFundName(tx.fund)}</td>
                                      <td>{formatSourceName(tx.moneySource)}</td>
                                      <td>{tx.activity}</td>
                                      <td className="numeric">{formatShares(tx.units)}</td>
                                      <td className="numeric">{formatUnitPrice(tx.unitPrice)}</td>
                                      <td className="numeric">{formatCurrency(tx.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}