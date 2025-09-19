import React from 'react';
import SummaryOverview from '../components/SummaryOverview.jsx';
import PortfolioTable from '../components/PortfolioTable.jsx';
import { formatCurrency, formatShares } from '../utils/formatters.js';

export default function Dashboard({ summary, transactions, onSync, isSyncing, syncStatus }) {
  return (
    <div className="dashboard">
      <section>
        <div className="section-header">
          <h2>Account Overview</h2>
          <div className="section-actions">
            <button type="button" className="primary" onClick={onSync} disabled={isSyncing || !transactions.length}>
              {isSyncing ? 'Syncing…' : 'Sync to GitHub'}
            </button>
          </div>
        </div>
        {syncStatus && <p className="status">{syncStatus}</p>}
        {!transactions.length && <p className="meta">No transactions stored yet. Visit the Import page to get started.</p>}
        <SummaryOverview
          totals={summary.totals}
          sourceTotals={summary.sourceTotals}
          timeline={summary.timeline}
          firstTransaction={summary.firstTransaction}
        />
      </section>

      <section>
        <h2>Portfolio Breakdown</h2>
        <PortfolioTable portfolio={summary.portfolio} totals={summary.totals} />
      </section>

      <section className="transactions">
        <h2>Stored Transactions ({transactions.length})</h2>
        <div className="transactions-list">
          {transactions.map(tx => (
            <details key={[tx.date, tx.fund, tx.moneySource, tx.units, tx.amount].join('|')}>
              <summary>
                {tx.date} · {tx.fund} · {tx.moneySource}
              </summary>
              <ul>
                <li>Activity: {tx.activity}</li>
                <li>Units: {formatShares(tx.units)}</li>
                <li>Unit Price: {formatCurrency(tx.unitPrice)}</li>
                <li>Amount: {formatCurrency(tx.amount)}</li>
              </ul>
            </details>
          ))}
          {!transactions.length && <p>No transactions stored yet.</p>}
        </div>
      </section>
    </div>
  );
}
