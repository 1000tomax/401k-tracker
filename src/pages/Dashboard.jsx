import React, { useMemo } from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import { formatCurrency, formatDate, formatFundName, formatUnitPrice } from '../utils/formatters.js';
import {
  ResponsiveContainer,
  AreaChart,
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
  onSync,
  isSyncing,
  syncStatus,
  remoteStatus,
  onRefresh,
  isRefreshing,
  navOverrides,
  onNavOverrideChange,
  onResetNavOverrides,
}) {
  const remoteTone = remoteStatus?.toLowerCase().includes('failed') ? 'error' : 'info';
  const syncTone = syncStatus?.toLowerCase().includes('failed') ? 'error' : 'success';
  const baseTrend = (summary.timeline || []).map(entry => ({
    date: entry.date,
    marketValue: entry.marketValue ?? entry.balance ?? 0,
    contributed: entry.investedBalance ?? entry.balance ?? 0,
  }));
  const isDev = Boolean(import.meta.env?.DEV);

  const { trendData, usingSampleData } = useMemo(() => {
    if (!isDev) {
      return { trendData: baseTrend, usingSampleData: false };
    }

    if (baseTrend.length >= 2) {
      return { trendData: baseTrend, usingSampleData: false };
    }

    const seedInvested = summary.totals.netInvested || 0;
    const seedMarket = summary.totals.marketValue || seedInvested;
    const today = new Date();
    const days = [60, 45, 30, 20, 10, 0];
    const increments = [0.6, 0.75, 0.9, 1, 1.15, 1.32];
    const sample = days.map((offset, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const invested = seedInvested * (0.85 + index * 0.03);
      const marketValue = seedMarket * increments[index] + index * 250;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return {
        date: `${yyyy}-${mm}-${dd}`,
        marketValue,
        contributed: invested,
      };
    });

    return { trendData: sample, usingSampleData: true };
  }, [baseTrend, isDev, summary.totals.marketValue, summary.totals.netInvested]);

  const formattedTrend = trendData.map(point => ({
    ...point,
    label: formatDate(point.date),
  }));

  const axisLabel = usingSampleData ? 'Sample Balance' : 'Account Value';

  const activeFundKeys = useMemo(() => {
    if (!summary.portfolio) return [];
    return Object.entries(summary.portfolio)
      .filter(([, sources]) => {
        const totalShares = Object.values(sources || {}).reduce((sum, metrics) => {
          const shares = Number.isFinite(metrics?.shares) ? metrics.shares : 0;
          return sum + shares;
        }, 0);
        return Math.abs(totalShares) > 1e-6;
      })
      .map(([fund]) => fund);
  }, [summary.portfolio]);

  const hasOverrides = useMemo(
    () =>
      activeFundKeys.some(fund => {
        const overrideValue = navOverrides?.[fund];
        const parsed = Number.parseFloat(overrideValue);
        return Number.isFinite(parsed) && parsed > 0;
      }),
    [activeFundKeys, navOverrides],
  );

  const tooltipFormatter = value => formatCurrency(value);

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

  return (
    <div className="dashboard">
      <section>
        <div className="section-header">
          <h2>Account Overview</h2>
          <div className="section-actions">
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
        {!transactions.length && <p className="meta">No transactions stored yet. Visit the Import page to get started.</p>}
        <SummaryOverview totals={summary.totals} firstTransaction={summary.firstTransaction} />
      </section>

      {activeFundKeys.length ? (
        <section>
          <div className="section-header">
            <h2>NAV Overrides</h2>
            <div className="section-actions">
              <button
                type="button"
                className="secondary"
                onClick={onResetNavOverrides}
                disabled={!hasOverrides}
              >
                Clear Overrides
              </button>
            </div>
          </div>
          <p className="meta">
            Enter optional net asset values to preview updated market values without changing stored data.
          </p>
          <div className="nav-override-grid">
            {activeFundKeys.map(fund => {
              const sources = summary.portfolio[fund];
              const firstSource = sources ? Object.values(sources)[0] : null;
              const latestNav = firstSource?.latestNAV ?? 0;
              const overrideValue = navOverrides?.[fund] ?? '';

              return (
                <div className="nav-override-card" key={fund}>
                  <div className="nav-override-header">
                    <h3>{formatFundName(fund)}</h3>
                    <span className="nav-override-current">Current NAV: {formatUnitPrice(latestNav)}</span>
                  </div>
                  <label className="nav-override-label" htmlFor={`nav-override-${fund}`}>
                    Override NAV
                  </label>
                  <input
                    id={`nav-override-${fund}`}
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    className="nav-override-input"
                    value={overrideValue}
                    placeholder={formatUnitPrice(latestNav)}
                    onChange={event => onNavOverrideChange(fund, event.target.value)}
                  />
                  <p className="nav-override-note">
                    Leave blank to use the latest imported NAV.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

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
                <AreaChart data={formattedTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(129, 140, 248, 0.9)" stopOpacity={0.6} />
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
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15, 23, 42, 0.92)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '0.75rem',
                      color: '#e2e8f0',
                    }}
                    labelStyle={{ color: 'rgba(203, 213, 225, 0.8)', fontWeight: 600 }}
                    formatter={tooltipFormatter}
                  />
                  <Legend verticalAlign="top" height={32} iconType="circle" />
                  <Area
                    type="monotone"
                    dataKey="marketValue"
                    name="Market value"
                    stroke="rgba(129, 140, 248, 0.95)"
                    strokeWidth={2.5}
                    fill="url(#balanceTrendGradient)"
                    fillOpacity={1}
                    dot={{ r: 3, strokeWidth: 0, fill: 'rgba(129, 140, 248, 0.95)' }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="contributed"
                    name="Total contributions"
                    stroke="#f97316"
                    strokeDasharray="6 3"
                    strokeWidth={2.5}
                    strokeOpacity={0.95}
                    fill="none"
                    fillOpacity={0}
                    dot={{ r: 3, strokeWidth: 1.8, stroke: '#f97316', fill: '#0f172a' }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: '#f97316', fill: '#fff' }}
                    connectNulls
                    isAnimationActive={false}
                    legendType="line"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <h2>Portfolio Breakdown</h2>
        <PortfolioTable portfolio={summary.portfolio} totals={summary.totals} />
      </section>

      {summary.timeline?.length ? (
        <section>
          <h2>Recent Activity</h2>
          <div className="table-wrapper compact">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Deposits</th>
                  <th>Net Invested</th>
                  <th>Market Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.timeline.slice(-6).reverse().map(entry => (
                  <tr key={entry.date}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{formatCurrency(entry.contributions)}</td>
                    <td>{formatCurrency(entry.investedBalance ?? entry.balance)}</td>
                    <td>
                      {formatCurrency(entry.marketValue ?? entry.investedBalance ?? entry.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
