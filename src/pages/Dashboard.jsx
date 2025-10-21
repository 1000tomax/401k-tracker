/**
 * @file Dashboard.jsx
 * @description Main dashboard page component displaying portfolio overview, charts, and holdings.
 *
 * Key features:
 * - Account growth chart showing market value vs cost basis over time
 * - Asset allocation pie charts (by account and by fund)
 * - Current holdings table grouped by account with expandable Voya sources
 * - Portfolio export to CSV functionality
 * - Live price indicators and timestamps
 * - Filterable fund allocation (all accounts, IRA only, or 401k only)
 */
import React, { useMemo, useState, memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { convertHoldingsToCSV, downloadCSV } from '../utils/csvExport.js';
import {
  ResponsiveContainer,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/**
 * Custom tooltip component for the account growth chart.
 * Displays formatted market value and cost basis for a specific date.
 * Not memoized to ensure Recharts compatibility.
 * @param {object} props - Recharts tooltip props
 * @param {boolean} props.active - Whether tooltip is active
 * @param {Array} props.payload - Data payload for the hovered point
 * @param {string} props.label - X-axis label (date)
 * @returns {React.Component|null} Tooltip component or null if inactive
 */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Only show marketValue and costBasis, explicitly exclude shade/area
  const marketValue = payload.find(item => item.dataKey === 'marketValue');
  const costBasis = payload.find(item => item.dataKey === 'costBasis');

  if (!marketValue && !costBasis) {
    return null;
  }

  // Extract numeric values - handle both number and string types
  const mvValue = typeof marketValue?.value === 'number' ? marketValue.value : parseFloat(marketValue?.value || 0);
  const cbValue = typeof costBasis?.value === 'number' ? costBasis.value : parseFloat(costBasis?.value || 0);

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label" style={{ fontWeight: 700, marginBottom: '10px', fontSize: '14px' }}>{label}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {marketValue && (
          <li key="marketValue" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <span className="dot" style={{ background: marketValue.stroke, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
            <span className="name" style={{ flex: 1 }}>Market Value</span>
            <span className="value" style={{ fontWeight: 600 }}>{formatCurrency(mvValue)}</span>
          </li>
        )}
        {costBasis && (
          <li key="costBasis" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <span className="dot" style={{ background: costBasis.stroke, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
            <span className="name" style={{ flex: 1 }}>Cost Basis</span>
            <span className="value" style={{ fontWeight: 600 }}>{formatCurrency(cbValue)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Custom tooltip component for pie charts showing asset allocation.
 * Displays the asset name, value, and percentage of total.
 * @param {object} props - Recharts tooltip props
 * @param {boolean} props.active - Whether tooltip is active
 * @param {Array} props.payload - Data payload for the hovered slice
 * @returns {React.Component|null} Tooltip component or null if inactive
 */
const PieTooltip = memo(({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{data.name}</div>
      <ul>
        <li>
          <span className="dot" style={{ background: payload[0].fill }} />
          <span className="name">Value</span>
          <span className="value">{formatCurrency(data.value)}</span>
        </li>
        <li>
          <span className="name">Allocation</span>
          <span className="value">{data.percentage}%</span>
        </li>
      </ul>
    </div>
  );
});
PieTooltip.displayName = 'PieTooltip';

/**
 * Dashboard page component that displays comprehensive portfolio overview.
 * @param {object} props - Component props
 * @param {object} props.summary - Portfolio summary data
 * @param {object} props.summary.totals - Portfolio totals (market value, cost basis, gain/loss)
 * @param {Array} props.summary.timeline - Historical portfolio values for charting
 * @param {Array} props.summary.holdings - Current holdings array
 * @param {Array} props.summary.holdingsByAccount - Holdings grouped by account
 * @param {boolean} props.isLoading - Whether data is currently loading
 * @returns {React.Component} Dashboard page component
 */
function Dashboard({ summary, isLoading }) {
  const { totals, timeline, holdings, holdingsByAccount } = summary;
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [portfolioFilter, setPortfolioFilter] = useState('all');

  /**
   * Extracts stock ticker symbol from various fund name formats.
   * Handles patterns like "Fund Name (SYMBOL)" or "SYMBOL - Fund Name".
   * @param {string} fundName - Full fund name that may contain a ticker
   * @returns {string|null} Extracted ticker symbol or null if not found
   */
  const extractTicker = (fundName) => {
    if (!fundName) return null;
    const cleaned = fundName.trim().toUpperCase();

    // Common ticker patterns
    if (/^[A-Z]{2,5}$/.test(cleaned)) return cleaned;

    const patterns = [
      /\(([A-Z]{2,5})\)/,
      /^([A-Z]{2,5})\s*[-:]/,
      /\b([A-Z]{2,5})\b/
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  /**
   * Prepares timeline data for the account growth chart.
   * Formats dates and ensures numeric values for plotting.
   * @returns {Array<object>} Array of data points with date, marketValue, costBasis
   */
  const trendData = useMemo(() => {
    return (timeline || []).map(entry => ({
      date: entry.date,
      marketValue: entry.marketValue ?? 0,
      costBasis: entry.costBasis ?? 0,
      label: formatDate(entry.date),
      marketValueShade: entry.marketValue ?? 0,
    }));
  }, [timeline]);

  /**
   * Formats Y-axis tick values to abbreviated currency strings.
   * Displays values as $1.5M, $2.3K, etc. for readability.
   * @param {number} value - Numeric value to format
   * @returns {string} Formatted currency string
   */
  const tickFormatter = useCallback(value => {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  }, []);

  /**
   * Calculates Y-axis domain with 10% padding above and below data range.
   * Ensures chart doesn't clip data points and provides visual breathing room.
   * @returns {Array<number>} [minValue, maxValue] for Y-axis domain
   */
  const yAxisDomain = useMemo(() => {
    if (!trendData.length) return [0, 'auto'];

    const allValues = trendData.flatMap(d => [d.marketValue, d.costBasis]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue;

    // Add 10% padding above and below for better visualization
    const padding = range * 0.1;
    const domainMin = Math.max(0, minValue - padding);
    const domainMax = maxValue + padding;

    return [Math.floor(domainMin), Math.ceil(domainMax)];
  }, [trendData]);

  /**
   * Toggles the expanded state of a collapsible account (e.g., Voya 401k with sources).
   * @param {string} accountName - Name of the account to toggle
   */
  const toggleAccountExpanded = useCallback((accountName) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountName)) {
        newSet.delete(accountName);
      } else {
        newSet.add(accountName);
      }
      return newSet;
    });
  }, []);

  /**
   * Exports current portfolio holdings to CSV file.
   * Generates filename with current date for easy organization.
   */
  const handleExportPortfolio = useCallback(() => {
    const csvData = convertHoldingsToCSV(holdingsByAccount);
    const filename = `portfolio-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvData, filename);
  }, [holdingsByAccount]);

  /**
   * Determines broad account type for filtering purposes.
   * @param {string} accountName - Account name to categorize
   * @returns {string} 'ira', '401k', or 'other'
   */
  const getAccountType = (accountName) => {
    const name = accountName.toLowerCase();
    if (name.includes('ira')) return 'ira';
    // 401k accounts: Voya, or if it's PreTax/Match/Roth without IRA
    if (name.includes('401') || name.includes('voya') ||
        name.includes('pretax') || name.includes('match') ||
        (name.includes('roth') && !name.includes('ira'))) {
      return '401k';
    }
    return 'other';
  };

  /**
   * Gets detailed account subtype for display in fund breakdown.
   * @param {string} accountName - Account name to parse
   * @returns {string} Specific account subtype (e.g., 'Roth IRA', 'PreTax', 'Match')
   */
  const getAccountSubtype = (accountName) => {
    const name = accountName.toLowerCase();
    if (name.includes('roth') && name.includes('ira')) return 'Roth IRA';
    if (name.includes('pretax')) return 'PreTax';
    if (name.includes('match')) return 'Match';
    if (name.includes('roth') && !name.includes('ira')) return 'Roth';
    return accountName;
  };

  /**
   * Calculates asset allocation data for pie charts.
   * Computes allocation by account (always all) and by fund (filterable by account type).
   * @returns {object} Object with accountAllocation, fundAllocation, and filteredTotal
   */
  const allocationData = useMemo(() => {
    // Account allocation (always show all)
    const accountAllocation = holdingsByAccount.map(account => ({
      name: account.accountName,
      value: account.totalValue,
      percentage: ((account.totalValue / totals.marketValue) * 100).toFixed(1),
    }));

    // Filter holdings based on portfolio filter for fund breakdown
    let filteredHoldings = holdings;
    if (portfolioFilter !== 'all') {
      filteredHoldings = holdings.filter(holding =>
        getAccountType(holding.accountName) === portfolioFilter
      );
    }

    // Calculate total for filtered holdings
    const filteredTotal = filteredHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    // Fund allocation by account type (e.g., "VAN 500 (Roth)")
    const fundMap = new Map();
    for (const holding of filteredHoldings) {
      if (!holding.accountName) continue; // Skip if accountName is undefined
      const fundName = holding.fund.includes('Vanguard 500') ? 'VAN 500' : holding.fund;
      const subtype = getAccountSubtype(holding.accountName);
      const key = `${fundName} (${subtype})`;
      const existing = fundMap.get(key) || 0;
      fundMap.set(key, existing + holding.marketValue);
    }

    const fundAllocation = Array.from(fundMap.entries())
      .map(([fund, value]) => ({
        name: fund,
        value,
        percentage: filteredTotal > 0 ? ((value / filteredTotal) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.value - a.value);

    return { accountAllocation, fundAllocation, filteredTotal };
  }, [holdingsByAccount, holdings, totals.marketValue, portfolioFilter]);

  // Color palette for pie charts (memoized to prevent recalculation)
  const COLORS = useMemo(() => [
    'rgba(99, 102, 241, 0.9)',   // Blue
    'rgba(251, 146, 60, 0.9)',   // Orange
    'rgba(34, 197, 94, 0.9)',    // Green
    'rgba(168, 85, 247, 0.9)',   // Purple
    'rgba(236, 72, 153, 0.9)',   // Pink
    'rgba(20, 184, 166, 0.9)',   // Teal
  ], []);

  if (isLoading) {
    return (
      <div className="dashboard">
        <div className="loading-state">
          <p>Loading portfolio data...</p>
        </div>
      </div>
    );
  }

  if (!holdings?.length) {
    return (
      <div className="dashboard">
        <section>
          <div className="section-header">
            <h2>Account Overview</h2>
          </div>
          <div className="empty-state">
            <p className="meta">No holdings data yet.</p>
            <p className="demo-description">
              Connect your accounts via Plaid to start tracking your portfolio automatically.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Account Growth Chart */}
      {trendData.length > 0 && (
        <section className="chart-section">
          <div className="section-header">
            <h2>Account Growth</h2>
            <p className="meta">Track your portfolio value over time.</p>
          </div>
          <div className="chart-panel">
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                    domain={yAxisDomain}
                    label={{
                      value: 'Account Value',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      fill: 'rgba(203, 213, 225, 0.75)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <Tooltip content={ChartTooltip} cursor={{ strokeDasharray: '3 3' }} />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    payload={[
                      { value: 'Market Value', type: 'line', color: 'rgba(99, 102, 241, 0.95)' },
                      { value: 'Cost Basis', type: 'line', color: 'rgba(251, 146, 60, 0.95)' }
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="marketValueShade"
                    name=""
                    stroke="rgba(129, 140, 248, 0.35)"
                    strokeWidth={1}
                    fill="url(#balanceTrendGradient)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                    tooltipType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="marketValue"
                    name="Market Value"
                    stroke="rgba(99, 102, 241, 0.95)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: 'rgba(99, 102, 241, 0.95)' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="costBasis"
                    name="Cost Basis"
                    stroke="rgba(251, 146, 60, 0.95)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: 'rgba(251, 146, 60, 0.95)' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Asset Allocation */}
      <section className="chart-section">
        <div className="section-header">
          <h2>Asset Allocation</h2>
          <p className="meta">Portfolio breakdown by account and fund.</p>
        </div>
        <div className="allocation-grid">
          {/* Account Allocation */}
          <div className="allocation-chart">
            <h3 className="allocation-title">By Account</h3>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={allocationData.accountAllocation}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  isAnimationActive={false}
                >
                  {allocationData.accountAllocation.map((entry, index) => (
                    <Cell key={`account-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={PieTooltip} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '10px', fontSize: 'var(--text-sm)' }}
                  formatter={(value) => <span style={{ color: 'var(--text-primary)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Fund Allocation */}
          <div className="allocation-chart">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 className="allocation-title" style={{ margin: 0 }}>By Fund</h3>
              <select
                value={portfolioFilter}
                onChange={(e) => setPortfolioFilter(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All</option>
                <option value="ira">IRA</option>
                <option value="401k">401(k)</option>
              </select>
            </div>
            {allocationData.fundAllocation.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={allocationData.fundAllocation}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    isAnimationActive={false}
                  >
                    {allocationData.fundAllocation.map((entry, index) => (
                      <Cell key={`fund-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={PieTooltip} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ paddingTop: '10px', fontSize: 'var(--text-sm)' }}
                    formatter={(value) => <span style={{ color: 'var(--text-primary)' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '350px', color: 'var(--text-secondary)' }}>
                No funds found for selected portfolio type
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Current Holdings by Account */}
      <section>
        <div className="section-header">
          <div>
            <h2>Current Holdings</h2>
            <p className="meta">Your portfolio holdings grouped by account.</p>
          </div>
          <div className="section-actions">
            <button
              className="primary"
              onClick={handleExportPortfolio}
              disabled={!holdings.length}
            >
              Export Portfolio
            </button>
          </div>
        </div>

        {holdingsByAccount.map(account => {
          const isExpanded = expandedAccounts.has(account.accountName);
          const isCollapsible = account.isCollapsible;

          // Format price timestamp
          const formatPriceTimestamp = (priceInfo) => {
            if (!priceInfo || !priceInfo.timestamp) return '';

            if (priceInfo.source === 'live') {
              // For live prices, show full date and time
              const date = new Date(priceInfo.timestamp);
              const month = date.getMonth() + 1;
              const day = date.getDate();
              const hours = date.getHours();
              const minutes = date.getMinutes().toString().padStart(2, '0');
              const ampm = hours >= 12 ? 'PM' : 'AM';
              const displayHours = hours % 12 || 12;
              return `${month}/${day} ${displayHours}:${minutes} ${ampm}`;
            } else {
              // For transaction-based prices, show just the date with "(transaction date)" suffix
              const date = new Date(priceInfo.timestamp + 'T00:00:00');
              const month = date.getMonth() + 1;
              const day = date.getDate();
              return `${month}/${day} (transaction date)`;
            }
          };

          const priceTimestampText = formatPriceTimestamp(account.priceInfo);

          return (
            <div key={account.accountName} className="account-section">
              <div
                className={`account-header ${isCollapsible ? 'collapsible' : ''}`}
                onClick={() => isCollapsible && toggleAccountExpanded(account.accountName)}
                style={isCollapsible ? { cursor: 'pointer' } : {}}
              >
                {isCollapsible && (
                  <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                )}
                <div className="account-header-content">
                  <h3>{account.accountName}</h3>
                  {priceTimestampText && (
                    <p className="price-timestamp">Prices as of {priceTimestampText}</p>
                  )}
                </div>
                <span className="account-total">{formatCurrency(account.totalValue)}</span>
              </div>

              {/* Holdings Table */}
              <div className="holdings-table-wrapper">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th className="numeric">Shares</th>
                      <th className="numeric">Avg Cost</th>
                      <th className="numeric">Cost Basis</th>
                      <th className="numeric">Latest Price</th>
                      <th className="numeric">Value</th>
                      <th className="numeric">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.holdings.map((holding, idx) => {
                      const gainLossPercent = holding.costBasis > 0
                        ? ((holding.gainLoss / holding.costBasis) * 100).toFixed(2)
                        : '0.00';
                      const gainLossClass = holding.gainLoss >= 0 ? 'positive' : 'negative';

                      // Format fund name nicely
                      const formatFundName = (name) => {
                        // "0899 Vanguard 500 Index Fund Adm" -> "VAN 500"
                        if (name.includes('Vanguard 500')) {
                          return 'VAN 500';
                        }
                        return name;
                      };

                      const ticker = extractTicker(holding.fund);

                      return (
                        <tr key={`${holding.fund}-${idx}`}>
                          <td>
                            {ticker ? (
                              <Link to={`/fund/${ticker}`} className="fund-link">
                                {formatFundName(holding.fund)}
                              </Link>
                            ) : (
                              formatFundName(holding.fund)
                            )}
                            {holding.isVoyaLive && (
                              <span
                                className="live-badge"
                                title="Live pricing via VOO proxy - Voya's proprietary fund 0899 tracks the S&P 500 but isn't publicly traded. We use VOO (Vanguard S&P 500 ETF) as a proxy with a 15.577 conversion ratio for real-time pricing. Historical accuracy: 99.8%"
                                style={{
                                  marginLeft: '8px',
                                  padding: '2px 6px',
                                  fontSize: '0.7rem',
                                  fontWeight: '600',
                                  color: '#10b981',
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                }}
                              >
                                Live
                              </span>
                            )}
                          </td>
                          <td className="numeric">{holding.shares.toFixed(4)}</td>
                          <td className="numeric">{formatCurrency(holding.avgCost)}</td>
                          <td className="numeric">{formatCurrency(holding.costBasis)}</td>
                          <td className="numeric">{formatCurrency(holding.latestNAV)}</td>
                          <td className="numeric">{formatCurrency(holding.marketValue)}</td>
                          <td className={`numeric ${gainLossClass}`}>
                            {formatCurrency(holding.gainLoss)} ({gainLossPercent}%)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sources Breakdown (for Voya) */}
              {isCollapsible && isExpanded && account.sources && (
                <div className="sources-breakdown">
                  <h4>Sources:</h4>
                  <ul>
                    {account.sources.map((source, idx) => {
                      const percentage = ((source.totalValue / account.totalValue) * 100).toFixed(1);
                      return (
                        <li key={idx}>
                          <span className="source-name">• {source.source}:</span>
                          <span className="source-value">
                            {formatCurrency(source.totalValue)} ({percentage}%)
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// Export memoized component to prevent unnecessary re-renders
export default memo(Dashboard);