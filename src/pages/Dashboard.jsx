import React, { useMemo, useState, useEffect, useCallback } from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import AccountSeparatedPortfolio from '../components/AccountSeparatedPortfolio.jsx';
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

export default function Dashboard({
  summary,
  transactions,
}) {
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
    // If we have any real data, use only real data (don't mix with sample data)
    if (baseTrend.length > 0) return baseTrend;
    // Only use sample data if there's no real data at all
    return sampleData;
  }, [baseTrend]);

  const usingSampleData = baseTrend.length === 0;

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
        </div>

        {!transactions.length && (
          <div className="empty-state">
            <p className="meta">No transactions loaded yet.</p>
            <div className="empty-state-actions">
              <a href="/import" className="import-link">🔗 Connect Your Accounts</a>
            </div>
            <p className="demo-description">
              Connect your 401k and investment accounts via Plaid for automatic transaction import and real-time portfolio tracking.
            </p>
          </div>
        )}
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
        <AccountSeparatedPortfolio
          portfolio={summary.portfolio}
          openPositions={summary.openPositions}
          closedPositions={summary.closedPositions}
          totals={summary.totals}
        />
      </section>

      {/* Recent Activity */}
      {summary.timeline?.length ? (
        <section>
          <div className="section-header">
            <h2>Recent Activity</h2>
            <p className="meta">Recent transaction activity by date.</p>
          </div>
          <div className="recent-table-wrapper">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Date</th>
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
                        <td>
                          {entry.transactions?.length ? (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleToggleDetails(entry.date)}
                            >
                              {expandedDate === entry.date ? 'Hide' : 'View'} ({entry.transactions.length})
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedDate === entry.date && entry.transactions?.length ? (
                        <tr className="recent-details">
                          <td colSpan={2}>
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