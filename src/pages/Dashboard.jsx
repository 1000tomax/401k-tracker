import React, { useMemo } from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import { formatCurrency, formatDate, formatFundName, formatUnitPrice } from '../utils/formatters.js';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
    value: entry.balance,
  }));
  const isDev = Boolean(import.meta.env?.DEV);

  const { trendData, usingSampleData } = useMemo(() => {
    if (!isDev) {
      return { trendData: baseTrend, usingSampleData: false };
    }

    if (baseTrend.length >= 2) {
      return { trendData: baseTrend, usingSampleData: false };
    }

    const seedValue = baseTrend.length ? baseTrend[0].value : summary.totals.netInvested || 0;
    const today = new Date();
    const days = [60, 45, 30, 20, 10, 0];
    const increments = [0.6, 0.75, 0.9, 1, 1.15, 1.32];
    const sample = days.map((offset, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const value = seedValue * increments[index] + index * 500;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return {
        date: `${yyyy}-${mm}-${dd}`,
        value,
      };
    });

    return { trendData: sample, usingSampleData: true };
  }, [baseTrend, isDev, summary.totals.netInvested]);

  const formattedTrend = trendData.map(point => ({
    ...point,
    label: formatDate(point.date),
    balance: point.value,
  }));

  const axisLabel = usingSampleData ? 'Sample Balance' : 'Balance';

  const fundKeys = Object.keys(summary.portfolio || {});
  const hasOverrides = useMemo(
    () => Object.values(navOverrides || {}).some(value => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) && parsed > 0;
    }),
    [navOverrides],
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

      {fundKeys.length ? (
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
            {fundKeys.map(fund => {
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
            <h2>Balance Trend</h2>
            <p className="meta">Running net contributions across your full transaction history.</p>
          </div>
          <div className="chart-panel">
            {usingSampleData && (
              <p className="chart-demo-note">Showing sample trend data locally until more transactions are imported.</p>
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
                    dataKey="balance"
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
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="rgba(129, 140, 248, 0.95)"
                    strokeWidth={2.5}
                    fill="url(#balanceTrendGradient)"
                    dot={{ r: 3, strokeWidth: 0, fill: 'rgba(129, 140, 248, 0.95)' }}
                    activeDot={{ r: 5 }}
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
                  <th>Contributions</th>
                  <th>Net</th>
                  <th>Running Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.timeline.slice(-6).reverse().map(entry => (
                  <tr key={entry.date}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{formatCurrency(entry.contributions)}</td>
                    <td className={entry.net >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(entry.net)}
                    </td>
                    <td>{formatCurrency(entry.balance)}</td>
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
