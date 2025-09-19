import React from 'react';
import {
  formatCurrency,
  formatShares,
  formatUnitPrice,
  formatDate,
  formatFundName,
  formatSourceName,
} from '../utils/formatters.js';

function transactionKey(tx) {
  return [tx.date, tx.activity, tx.fund, tx.moneySource, tx.units, tx.amount].join('|');
}

export default function ImportPage({
  rawInput,
  setRawInput,
  onParse,
  onApplyImport,
  onCancelImport,
  onClearAll,
  pendingImport,
  importStatus,
  transactionsCount,
  transactions = [],
}) {
  return (
    <div className="import-page">
      <section className="input-section">
        <h2>Add Transactions</h2>
        <p className="meta">
          Paste your latest Voya log here. We'll parse the rows, dedupe against existing data, and let you preview before saving.
        </p>
        <label htmlFor="transactions-input">Transaction Log</label>
        <textarea
          id="transactions-input"
          value={rawInput}
          onChange={event => setRawInput(event.target.value)}
          placeholder="Paste tab-separated transaction data here"
          rows={12}
        />
        <div className="actions">
          <button type="button" onClick={onParse} disabled={!rawInput.trim()}>
            Preview Additions
          </button>
          <button type="button" className="secondary" onClick={onClearAll} disabled={!transactionsCount}>
            Clear All Stored Data
          </button>
        </div>
        {importStatus && <p className="status">{importStatus}</p>}
      </section>

      {pendingImport && (
        <section>
          <h2>Preview New Entries</h2>
          <p className="meta">
            Previewing {pendingImport.parsedCount} row
            {pendingImport.parsedCount === 1 ? '' : 's'}: {pendingImport.additions.length} new,{' '}
            {pendingImport.duplicateCount} duplicate
            {pendingImport.duplicateCount === 1 ? '' : 's'}.
          </p>
          {pendingImport.additions.length > 0 ? (
            <>
              <div className="table-wrapper compact">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fund</th>
                      <th>Source</th>
                      <th>Activity</th>
                      <th>Shares</th>
                      <th>Price</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingImport.additions.slice(0, 10).map(tx => (
                      <tr key={transactionKey(tx)}>
                        <td>{formatDate(tx.date)}</td>
                        <td>{formatFundName(tx.fund)}</td>
                        <td>{formatSourceName(tx.moneySource)}</td>
                        <td>{tx.activity}</td>
                        <td>{formatShares(tx.units)}</td>
                        <td>{formatUnitPrice(tx.unitPrice)}</td>
                        <td>{formatCurrency(tx.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pendingImport.additions.length > 10 && (
                <p className="meta">Showing first 10 of {pendingImport.additions.length} new rows.</p>
              )}
            </>
          ) : (
            <p className="meta">All pasted rows are duplicates of what you already have stored.</p>
          )}

          <div className="import-actions">
            <button
              type="button"
              className="primary"
              onClick={onApplyImport}
              disabled={!pendingImport.additions.length}
            >
              Add Transactions
            </button>
            <button type="button" className="secondary" onClick={onCancelImport}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="transactions">
        <h2>Stored Transactions ({transactions.length})</h2>
        <div className="transactions-list">
          {transactions.map(tx => (
            <details key={transactionKey(tx)}>
              <summary>
                {formatDate(tx.date)} · {formatFundName(tx.fund)} · {formatSourceName(tx.moneySource)}
              </summary>
              <ul>
                <li>Activity: {tx.activity}</li>
                <li>Source: {formatSourceName(tx.moneySource)}</li>
                <li>Shares: {formatShares(tx.units)}</li>
                <li>Unit Price: {formatUnitPrice(tx.unitPrice)}</li>
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
