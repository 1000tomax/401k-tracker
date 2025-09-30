import React, { useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters.js';
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

export default function Dashboard({ summary, isLoading }) {
  const { totals, timeline, holdings, holdingsByAccount } = summary;
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());

  const trendData = useMemo(() => {
    return (timeline || []).map(entry => ({
      date: entry.date,
      marketValue: entry.marketValue ?? 0,
      label: formatDate(entry.date),
      marketValueShade: entry.marketValue ?? 0,
    }));
  }, [timeline]);

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
              <span className="name">Portfolio Value</span>
              <span className="value">{formatCurrency(item.value ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const toggleAccountExpanded = (accountName) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountName)) {
        newSet.delete(accountName);
      } else {
        newSet.add(accountName);
      }
      return newSet;
    });
  };

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
                  <Tooltip content={renderTooltip} />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    payload={[
                      { value: 'Market value', type: 'line', color: 'rgba(99, 102, 241, 0.95)' }
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
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Current Holdings by Account */}
      <section>
        <div className="section-header">
          <h2>Current Holdings</h2>
          <p className="meta">Your portfolio holdings grouped by account.</p>
        </div>

        {holdingsByAccount.map(account => {
          const isExpanded = expandedAccounts.has(account.accountName);
          const isCollapsible = account.isCollapsible;

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
                <h3>{account.accountName}</h3>
                <span className="account-total">{formatCurrency(account.totalValue)}</span>
              </div>

              {/* Holdings Table */}
              <div className="holdings-table-wrapper">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th className="numeric">Shares</th>
                      <th className="numeric">Price</th>
                      <th className="numeric">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.holdings.map((holding, idx) => (
                      <tr key={`${holding.fund}-${idx}`}>
                        <td>{holding.fund}</td>
                        <td className="numeric">{holding.shares.toFixed(4)}</td>
                        <td className="numeric">{formatCurrency(holding.unitPrice)}</td>
                        <td className="numeric">{formatCurrency(holding.marketValue)}</td>
                      </tr>
                    ))}
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