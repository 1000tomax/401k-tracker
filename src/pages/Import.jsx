import React, { useState } from 'react';
import ImportMethodSelector from '../components/ImportMethodSelector';
import PlaidService from '../services/PlaidService';
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
  onImportFiles,
  isImportingFiles = false,
}) {
  const [selectedImportMethod, setSelectedImportMethod] = useState(null);
  const [plaidConnectionData, setPlaidConnectionData] = useState(null);
  const [isLoadingPlaidTransactions, setIsLoadingPlaidTransactions] = useState(false);

  const handleFileChange = event => {
    if (!onImportFiles) {
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    onImportFiles(files);
    event.target.value = '';
  };

  const handlePlaidSuccess = async (plaidData) => {
    console.log('Plaid connection established:', plaidData);
    setPlaidConnectionData(plaidData);

    // Automatically fetch recent transactions
    try {
      setIsLoadingPlaidTransactions(true);
      const investmentTxns = await PlaidService.getInvestmentTransactions(plaidData.accessToken);

      if (investmentTxns.investment_transactions && investmentTxns.investment_transactions.length > 0) {
        // Convert Plaid transactions to your app's format
        const convertedTransactions = PlaidService.convertPlaidToTrackerFormat(
          investmentTxns.investment_transactions
        );

        console.log(`Fetched ${convertedTransactions.length} investment transactions from Plaid`);

        // Convert the transactions to the format expected by the app's import system
        const transactionText = convertedTransactions.map(tx =>
          `${tx.date}\t${tx.fund}\t${tx.moneySource}\t${tx.activity}\t${tx.units}\t${tx.unitPrice}\t${tx.amount}`
        ).join('\n');

        // Add header row
        const csvText = 'Date\tFund\tSource\tActivity\tShares\tPrice\tAmount\n' + transactionText;

        // Update the raw input with the Plaid data
        setRawInput(csvText);

        // Trigger the parsing process to show preview
        if (onParse) {
          onParse(csvText);
        }

        console.log(`Successfully imported ${convertedTransactions.length} transactions from ${plaidData.institution.name}`);
      } else {
        alert(`Connected to ${plaidData.institution.name} successfully, but no investment transactions found in the last 90 days.`);
      }

    } catch (error) {
      console.error('Error fetching Plaid transactions:', error);
      alert('Connected successfully, but failed to fetch transactions. Please try again.');
    } finally {
      setIsLoadingPlaidTransactions(false);
    }
  };

  return (
    <div className="import-page">
      <section className="input-section">
        <h2>Account Connections</h2>
        <p className="meta">
          Connect your 401k and investment accounts for automatic transaction imports and real-time portfolio tracking.
        </p>
        
        <ImportMethodSelector 
          onMethodSelect={setSelectedImportMethod}
          onPlaidSuccess={handlePlaidSuccess}
        />

        {isLoadingPlaidTransactions && (
          <div className="plaid-loading">
            <p>Fetching your investment transactions...</p>
          </div>
        )}

        {plaidConnectionData && (
          <div className="plaid-connection-status">
            <h3>✅ Connected to {plaidConnectionData.institution.name}</h3>
            <p>Your account is now connected and transactions will be imported automatically.</p>
          </div>
        )}

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
