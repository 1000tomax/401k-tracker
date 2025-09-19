import React from 'react';
import { formatCurrency, formatShares, formatDate } from '../utils/formatters.js';

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
}) {
  return (
    <div className="import-page">
      <section className="input-section">
        <h2>Import Transactions</h2>
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
            Preview Import
          </button>
          <button type="button" className="secondary" onClick={onClearAll} disabled={!transactionsCount}>
            Clear All Stored Data
          </button>
        </div>
        {importStatus && <p className="status">{importStatus}</p>}
      </section>

      {pendingImport && (
        <section>
          <h2>Import Preview</h2>
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
                        <td>{tx.fund}</td>
                        <td>{tx.moneySource}</td>
                        <td>{tx.activity}</td>
                        <td>{formatShares(tx.units)}</td>
                        <td>{formatCurrency(tx.unitPrice)}</td>
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
              Apply Import
            </button>
            <button type="button" className="secondary" onClick={onCancelImport}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
