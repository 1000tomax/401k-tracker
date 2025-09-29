import React, { useState, useEffect } from 'react';
import ImportMethodSelector from '../components/ImportMethodSelector';
import PlaidDebugger from '../components/PlaidDebugger';
import PlaidService from '../services/PlaidService';
import MockPlaidService from '../services/MockPlaidService';
import PlaidTransactionManager from '../services/PlaidTransactionManager';
import PlaidDatabaseService from '../services/PlaidDatabaseService';
import { usePlaidAuth } from '../contexts/PlaidAuthContext';
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
  onDirectImport, // New: for direct transaction import
}) {
  const [selectedImportMethod, setSelectedImportMethod] = useState(null);
  const [plaidConnectionData, setPlaidConnectionData] = useState(null);
  const [isLoadingPlaidTransactions, setIsLoadingPlaidTransactions] = useState(false);
  const [plaidDebugData, setPlaidDebugData] = useState(null);
  const [convertedDebugData, setConvertedDebugData] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [savedConnectionData, setSavedConnectionData] = useState(null);
  const [isLoadingSavedConnection, setIsLoadingSavedConnection] = useState(false);

  const { saveConnection, hasSavedConnections, loadSavedConnections, clearAllData } = usePlaidAuth();

  const isDevelopment = import.meta.env.DEV;

  // Load saved connections on component mount
  useEffect(() => {
    const loadSavedConnectionsOnMount = async () => {
      if (hasSavedConnections && !savedConnectionData) {
        console.log('🔍 Checking for saved connections...');
        try {
          const savedConnections = await loadSavedConnections();
          if (savedConnections && savedConnections.length > 0) {
            // Get first connection (or handle multiple later)
            const connection = savedConnections[0];
            console.log('✅ Found saved connection:', connection.institution_name);
            setSavedConnectionData(savedConnections);
          }
        } catch (error) {
          console.error('❌ Failed to load saved connections:', error);
        }
      }
    };

    loadSavedConnectionsOnMount();
  }, [hasSavedConnections]);

  // Keyboard shortcut for clearing data in development
  useEffect(() => {
    if (!isDevelopment) return;

    const handleKeyDown = (event) => {
      // Ctrl+Shift+Delete or Cmd+Shift+Delete to clear all data
      if (event.ctrlKey && event.shiftKey && event.key === 'Delete') {
        event.preventDefault();
        if (confirm('🗑️ Clear all local data? This will reset the app to a clean state.')) {
          clearAllData();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevelopment, clearAllData]);

  // Function to load saved connection and fetch fresh transaction data
  const handleLoadSavedConnection = async () => {
    if (!savedConnectionData) return;

    console.log('🔄 Loading saved connection and fetching fresh transactions...', { savedConnectionData });
    setIsLoadingSavedConnection(true);

    try {
      // Transform database format to Plaid format
      // Database returns array with snake_case, need single object with camelCase
      const connections = Array.isArray(savedConnectionData) ? savedConnectionData : [savedConnectionData];
      const connection = connections[0];

      if (!connection) {
        throw new Error('No connection data found');
      }

      if (!connection.access_token) {
        throw new Error('Missing access_token in saved connection');
      }

      const transformedData = {
        accessToken: connection.access_token,
        itemId: connection.item_id,
        institution: {
          id: connection.institution_id,
          name: connection.institution_name,
        },
        accounts: connection.accounts || [],
      };

      console.log('🔄 Transformed connection data:', {
        hasAccessToken: !!transformedData.accessToken,
        accessTokenPrefix: transformedData.accessToken?.substring(0, 10),
        institution: transformedData.institution.name,
        accountCount: transformedData.accounts.length
      });

      await handlePlaidSuccess(transformedData);
    } catch (error) {
      console.error('❌ Failed to load saved connection:', error);
      alert(`Failed to load saved connection: ${error.message}`);
    } finally {
      setIsLoadingSavedConnection(false);
    }
  };

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
    console.log('🔗 Plaid connection established:', plaidData);
    setPlaidConnectionData(plaidData);

    // Use PlaidTransactionManager for direct auto-import
    try {
      setIsLoadingPlaidTransactions(true);
      console.log('🚀 Starting auto-import from Plaid...');

      // Auto-import with smart deduplication
      const importResults = await PlaidTransactionManager.autoImportFromPlaid(
        plaidData,
        transactions,
        {
          dateRange: 90,
          skipDuplicateCheck: false,
          autoSaveConnection: true
        }
      );

      // Store debug data
      setPlaidDebugData(importResults.rawPlaidData);
      setConvertedDebugData(importResults.imported);
      setShowDebugPanel(true);

      if (importResults.success && importResults.imported.length > 0) {
        console.log('✅ Auto-import successful:', {
          imported: importResults.stats.imported,
          duplicates: importResults.stats.skipped,
          conflicts: importResults.stats.conflicts
        });

        // Direct import - no manual approval needed
        if (onDirectImport) {
          console.log('📥 Directly importing transactions to app...');
          await onDirectImport(importResults.imported);
        }

        // Save transactions to database (only for real Plaid connections)
        const isMockData = importResults.isMockData;
        if (!isMockData) {
          const startTime = Date.now();
          let savedConnection = null;

          // Save the connection for future use (do this first to get connection_id)
          console.log('💾 Saving Plaid connection for future use...');
          savedConnection = await saveConnection(plaidData);
          if (savedConnection) {
            console.log('✅ Connection saved successfully');
          } else {
            console.warn('⚠️ Failed to save connection');
          }

          // Save transactions to database
          console.log('💾 Saving transactions to database...');
          try {
            const dbResult = await PlaidDatabaseService.importTransactions(importResults.imported);
            console.log('✅ Transactions saved to database:', dbResult);

            // Reload connection data to show updated last_synced_at timestamp
            console.log('🔄 Reloading connection data...');
            const updatedConnections = await loadSavedConnections();
            if (updatedConnections && updatedConnections.length > 0) {
              setSavedConnectionData(updatedConnections);
              console.log('✅ Connection data refreshed');
            }
          } catch (error) {
            console.error('❌ Failed to save transactions to database:', error);
          }
        }

        // Generate summary
        const summary = PlaidTransactionManager.generateImportSummary(importResults);
        console.log('📊 Import Summary:', summary);

        // Update UI with success message
        const institutionName = plaidData.institution?.name || 'your account';
        const successMessage = `Auto-imported ${importResults.stats.imported} transactions from ${institutionName}`;
        console.log(`🎉 ${successMessage}`);
      } else if (importResults.success) {
        console.log('ℹ️ No new transactions to import');
        const message = importResults.stats.total === 0
          ? `Connected to ${plaidData.institution.name} successfully, but no transactions found in the last 90 days`
          : `Connected successfully - all ${importResults.stats.total} transactions were duplicates and skipped`;
        alert(message);
      } else {
        // Import failed
        console.error('❌ Auto-import failed:', importResults.error);
        alert(`Failed to import transactions: ${importResults.error}`);
      }

    } catch (error) {
      console.error('❌ Error fetching transactions:', error);
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

        {/* Saved Connections Section */}
        {savedConnectionData && savedConnectionData.length > 0 && (
          <div className="saved-connections-section">
            <h3>💾 Saved Connection</h3>
            <div className="saved-connection-card">
              <div className="connection-info">
                <div className="institution-name">
                  {savedConnectionData[0].institution_name || 'Unknown Institution'}
                </div>
                <div className="connection-details">
                  <span className="connection-date">
                    Connected: {new Date(savedConnectionData[0].connected_at).toLocaleDateString()}
                  </span>
                  <span className="connection-last-sync">
                    Last sync: {savedConnectionData[0].last_synced_at ? new Date(savedConnectionData[0].last_synced_at).toLocaleDateString() : 'Never'}
                  </span>
                </div>
                <div className="account-count">
                  {savedConnectionData[0].accounts?.length || 0} account(s) connected
                </div>
              </div>
              <div className="connection-actions">
                <button
                  className="load-connection-btn primary"
                  onClick={handleLoadSavedConnection}
                  disabled={isLoadingSavedConnection || isLoadingPlaidTransactions}
                >
                  {isLoadingSavedConnection ? 'Loading...' : '🔄 Load & Sync'}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Debug Panel for Plaid Data */}
        <PlaidDebugger
          plaidData={plaidDebugData}
          convertedTransactions={convertedDebugData}
          onToggle={() => setShowDebugPanel(!showDebugPanel)}
          isVisible={showDebugPanel}
        />

        {importStatus && <p className="status">{importStatus}</p>}

        {/* Development Tools */}
        {isDevelopment && (
          <div className="dev-tools-section">
            <h3>🛠️ Development Tools</h3>
            <div className="dev-tools">
              <button
                className="dev-tool-button clear-data"
                onClick={clearAllData}
                title="Clear all local storage, session storage, and saved connections"
              >
                🗑️ Clear All Local Data
              </button>
              <p className="dev-tool-description">
                Clears all stored connections, session data, and local storage for testing.
                Use this to reset the app to a clean state.
                <br />
                <strong>Shortcut:</strong> Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
              </p>
            </div>
          </div>
        )}
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

      <style jsx>{`
        .saved-connections-section {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
        }

        .saved-connections-section h3 {
          margin: 0 0 1rem 0;
          color: #495057;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .saved-connection-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .connection-info {
          flex-grow: 1;
        }

        .institution-name {
          font-weight: 600;
          font-size: 1.1rem;
          color: #212529;
          margin-bottom: 0.5rem;
        }

        .connection-details {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.25rem;
        }

        .connection-date,
        .connection-expires {
          font-size: 0.85rem;
          color: #6c757d;
        }

        .account-count {
          font-size: 0.9rem;
          color: #495057;
        }

        .connection-actions {
          margin-left: 1rem;
        }

        .load-connection-btn {
          background: #007bff;
          color: white;
          border: 2px solid #0056b3;
          border-radius: 6px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .load-connection-btn:hover:not(:disabled) {
          background: #0056b3;
          border-color: #004085;
          transform: translateY(-1px);
        }

        .load-connection-btn:disabled {
          background: #6c757d;
          border-color: #5a6268;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .saved-connection-card {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }

          .connection-actions {
            margin-left: 0;
          }

          .load-connection-btn {
            width: 100%;
          }

          .connection-details {
            flex-direction: column;
            gap: 0.25rem;
          }
        }

        /* Development Tools */
        .dev-tools-section {
          margin-top: 2rem;
          padding: 1rem;
          background: #1a1a2e;
          border: 2px solid #ff6b6b;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(255, 107, 107, 0.2);
        }

        .dev-tools-section h3 {
          margin: 0 0 1rem 0;
          color: #ff6b6b;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .dev-tools {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .dev-tool-button {
          background: #ff4757;
          color: white;
          border: 2px solid #ff3742;
          border-radius: 6px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
          align-self: flex-start;
        }

        .dev-tool-button:hover {
          background: #ff3742;
          border-color: #ff2936;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
        }

        .dev-tool-description {
          color: #ffa726;
          font-size: 0.85rem;
          margin: 0;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .dev-tool-button {
            align-self: stretch;
          }
        }
      `}</style>
    </div>
  );
}
