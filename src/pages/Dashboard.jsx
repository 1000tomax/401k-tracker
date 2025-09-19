import React from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

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
        {remoteStatus && <p className="meta">{remoteStatus}</p>}
        {syncStatus && <p className="status">{syncStatus}</p>}
        {!transactions.length && <p className="meta">No transactions stored yet. Visit the Import page to get started.</p>}
        <SummaryOverview totals={summary.totals} firstTransaction={summary.firstTransaction} />
      </section>

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
