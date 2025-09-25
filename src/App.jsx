import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import ImportPage from './pages/Import.jsx';
import Settings from './pages/Settings.jsx';
import { parseTransactions, aggregatePortfolio } from './utils/parseTransactions.js';
import { migrateLegacyToMultiAccount } from './utils/schemas.js';
import { formatDate, formatCurrency } from './utils/formatters.js';
import { importM1FinanceFromFiles, validateM1FinanceData } from './utils/m1FinanceImporter.js';
import { PlaidAuthProvider, usePlaidAuth } from './contexts/PlaidAuthContext.jsx';
import PlaidTransactionManager from './services/PlaidTransactionManager.js';

const STORAGE_KEY = '401k-tracker-data';
const STORAGE_VERSION = 1;
const SNAPSHOT_ENDPOINT = '/api/snapshot';
const CLIENT_SHARED_TOKEN =
  (import.meta.env && import.meta.env.VITE_401K_TOKEN) ||
  (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_401K_TOKEN : undefined) ||
  '';
const REQUEST_AUTH_HEADER = CLIENT_SHARED_TOKEN || 'dev-only-token';
const SETTINGS_STORAGE_KEY = 'portfolio-settings';
const DEFAULT_PORTFOLIO_SETTINGS = {
  multiAccountMode: false,
  defaultView: 'consolidated',
  userAge: '',
  autoRefreshPrices: false
};

function readStoredSettings() {
  if (typeof window === 'undefined') {
    return DEFAULT_PORTFOLIO_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PORTFOLIO_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PORTFOLIO_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.warn('Failed to load portfolio settings', error);
    return DEFAULT_PORTFOLIO_SETTINGS;
  }
}

function hashTransaction(tx) {
  return [
    tx.date,
    tx.activity,
    tx.fund,
    tx.moneySource,
    tx.units,
    tx.unitPrice,
    tx.amount,
  ].join('|');
}

function sortTransactions(list) {
  return [...list].sort((a, b) => {
    if (a.date === b.date) {
      return hashTransaction(a).localeCompare(hashTransaction(b));
    }
    return a.date.localeCompare(b.date);
  });
}

function loadData() {
  if (typeof window === 'undefined') {
    return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null };
    }

    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION) {
      return {
        version: STORAGE_VERSION,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        lastSyncAt: parsed.lastSyncAt || null,
      };
    }

    return {
      version: STORAGE_VERSION,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      lastSyncAt: parsed.lastSyncAt || null,
    };
  } catch (error) {
    console.error('Failed to load stored data', error);
    return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null };
  }
}

function saveData({ transactions, lastSyncAt }) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        transactions,
        lastSyncAt: lastSyncAt || null,
      }),
    );
  } catch (error) {
    console.error('Failed to persist tracker data', error);
  }
}

function clearAllData() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Clear transaction data
    window.localStorage.removeItem(STORAGE_KEY);
    // Reset settings to defaults (but keep them for personal use)
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_PORTFOLIO_SETTINGS));
    console.log('Cleared all demo/manual data for Plaid-only setup');
  } catch (error) {
    console.error('Failed to clear stored data', error);
  }
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [rawInput, setRawInput] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [remoteStatus, setRemoteStatus] = useState('Loading latest data from GitHub…');
  const [isFetchingRemote, setIsFetchingRemote] = useState(true);
  const [isImportingFiles, setIsImportingFiles] = useState(false);

  // New state for auto-import functionality
  const [lastPlaidSync, setLastPlaidSync] = useState(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [autoImportStats, setAutoImportStats] = useState({
    imported: 0,
    duplicates: 0,
    lastUpdate: null
  });

  const [portfolioSettings, setPortfolioSettings] = useState(() => readStoredSettings());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(portfolioSettings));
    } catch (error) {
      console.warn('Failed to persist portfolio settings', error);
    }
  }, [portfolioSettings]);

  const handleSettingChange = useCallback((key, value) => {
    setPortfolioSettings(prev => {
      const next = {
        ...prev,
        [key]: key === 'userAge' ? (value === '' ? '' : value) : value,
      };
      return next;
    });
  }, []);

  const handleResetSettings = useCallback(() => {
    setPortfolioSettings(DEFAULT_PORTFOLIO_SETTINGS);
  }, []);

  useEffect(() => {
    // Clear all existing demo/manual data for fresh Plaid-only setup
    clearAllData();
    
    // Start with empty state - data will come from Plaid connections
    setTransactions([]);
    setLastSyncAt(null);
    setImportStatus('Ready for Plaid account connections');
  }, []);

  const summary = useMemo(() => aggregatePortfolio(transactions), [transactions]);

  const userSettingsForPortfolio = useMemo(() => ({
    multiAccountMode: !!portfolioSettings.multiAccountMode,
    defaultView: portfolioSettings.defaultView || 'consolidated',
    userAge: (() => {
      if (portfolioSettings.userAge === '' || portfolioSettings.userAge == null) {
        return undefined;
      }
      const numeric = Number(portfolioSettings.userAge);
      return Number.isFinite(numeric) ? numeric : undefined;
    })(),
    autoRefreshPrices: !!portfolioSettings.autoRefreshPrices
  }), [portfolioSettings]);

  const multiAccountPortfolio = useMemo(() => {
    if (!portfolioSettings.multiAccountMode) {
      return null;
    }

    let aggregated = null;

    if (transactions.length) {
      const legacyData = {
        version: '1.0',
        transactions,
        totals: summary.totals,
        portfolio: summary.portfolio,
        lastSyncAt,
        lastUpdated: summary.lastUpdated,
      };

      try {
        const migrated = migrateLegacyToMultiAccount(legacyData);
        aggregated = {
          ...migrated,
          settings: {
            ...migrated.settings,
            ...userSettingsForPortfolio,
            multiAccountMode: true,
          },
          sampleData: false,
        };
      } catch (error) {
        console.warn('Failed to migrate legacy portfolio to multi-account format', error);
      }
    }

    if (!aggregated) {
      aggregated = null;
    }

    return aggregated;
  }, [portfolioSettings.multiAccountMode, transactions, summary, lastSyncAt, userSettingsForPortfolio]);

  useEffect(() => {
    saveData({ transactions, lastSyncAt });
  }, [transactions, lastSyncAt]);

  const fetchFromGitHub = useCallback(async () => {
    setIsFetchingRemote(true);
    setRemoteStatus('Loading latest data from GitHub…');

    try {
      const response = await fetch(`${SNAPSHOT_ENDPOINT}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-401K-Token': REQUEST_AUTH_HEADER,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (payload?.snapshot && Array.isArray(payload.snapshot.transactions)) {
        setTransactions(sortTransactions(payload.snapshot.transactions));
      } else {
        throw new Error('Snapshot response missing transactions array.');
      }

      const syncTimestamp =
        payload.snapshot.syncedAt || payload.snapshot.lastUpdated || payload.fetchedAt || null;
      if (syncTimestamp) {
        setLastSyncAt(syncTimestamp);
      }

      setRemoteStatus('Loaded latest data from GitHub.');
    } catch (error) {
      console.error('Failed to load snapshot from GitHub', error);
      setRemoteStatus(`Failed to load data from GitHub: ${error.message}`);
    } finally {
      setIsFetchingRemote(false);
    }
  }, []);

  useEffect(() => {
    // TEMPORARILY DISABLED FOR PLAID TESTING
    // fetchFromGitHub();
  }, [fetchFromGitHub]);

  const handleRefreshMarket = useCallback(() => {
    // Placeholder until live market data pipeline is wired for multi-account dashboard
    console.info('Market refresh requested (stub)');
  }, []);

  const handleParse = useCallback(() => {
    const parsed = parseTransactions(rawInput);
    if (!parsed.length) {
      setImportStatus('No transactions detected. Check the input format.');
      setPendingImport(null);
      return;
    }

    const existingKeys = new Set(transactions.map(hashTransaction));
    const additions = [];
    const duplicates = [];

    for (const tx of parsed) {
      const key = hashTransaction(tx);
      if (existingKeys.has(key)) {
        duplicates.push(tx);
        continue;
      }
      additions.push(tx);
    }

    const newAdditions = sortTransactions(additions);
    const parsedCount = parsed.length;
    const duplicateCount = duplicates.length;

    setPendingImport({
      parsedCount,
      duplicateCount,
      additions: newAdditions,
    });

    const statusParts = [`Found ${parsedCount} row${parsedCount === 1 ? '' : 's'}.`];
    if (newAdditions.length) {
      statusParts.push(
        `${newAdditions.length} new entr${
          newAdditions.length === 1 ? 'y' : 'ies'
        } ready to add.`,
      );
    } else {
      statusParts.push('All were duplicates.');
    }
    if (duplicateCount) {
      statusParts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`);
    }
    setImportStatus(statusParts.join(' '));
  }, [rawInput, transactions]);

  const handleImportFiles = useCallback(
    async fileList => {
      const files = Array.from(fileList || []);
      if (!files.length) {
        return;
      }

      setImportStatus(`Reading ${files.length} file${files.length === 1 ? '' : 's'}…`);
      setPendingImport(null);
      setIsImportingFiles(true);

      try {
        // Check if this might be M1 Finance files
        const fileContents = await Promise.all(
          files.map(async file => ({
            name: file.name,
            content: await file.text()
          }))
        );

        // Detect if any files contain M1 Finance headers
        const hasM1Headers = fileContents.some(file => {
          const firstLine = file.content.split('\n')[0]?.toLowerCase() || '';
          return (
            (firstLine.includes('symbol') && firstLine.includes('transaction type')) ||
            (firstLine.includes('symbol') && firstLine.includes('quantity') && firstLine.includes('value'))
          );
        });

        let parsed = [];
        let importType = 'standard';

        if (hasM1Headers) {
          // Try to process as M1 Finance files
          try {
            const m1Result = await importM1FinanceFromFiles(files, {
              accountName: 'M1 Finance Account',
              mergeWithExisting: true
            });

            if (m1Result.success && m1Result.transactions.length > 0) {
              parsed = m1Result.transactions;
              importType = 'm1_finance';
              setImportStatus(`Detected M1 Finance export files. Processing ${m1Result.summary.transactionCount} transactions and ${m1Result.summary.holdingCount} holdings.`);
            } else {
              // Fall back to standard parsing
              parsed = fileContents.flatMap(file => parseTransactions(file.content));
            }
          } catch (m1Error) {
            console.warn('M1 Finance parsing failed, falling back to standard parsing:', m1Error);
            parsed = fileContents.flatMap(file => parseTransactions(file.content));
          }
        } else {
          // Standard transaction parsing
          parsed = fileContents.flatMap(file => parseTransactions(file.content));
        }

        if (!parsed.length) {
          setImportStatus('No transactions detected in the selected file(s).');
          return;
        }

        const existingKeys = new Set(transactions.map(hashTransaction));
        const additions = [];
        const duplicates = [];

        for (const tx of parsed) {
          const key = hashTransaction(tx);
          if (existingKeys.has(key)) {
            duplicates.push(tx);
            continue;
          }
          additions.push(tx);
        }

        const newAdditions = sortTransactions(additions);
        const parsedCount = parsed.length;
        const duplicateCount = duplicates.length;

        setPendingImport({
          parsedCount,
          duplicateCount,
          additions: newAdditions,
          importType,
        });

        const parts = [
          `Parsed ${parsedCount} row${parsedCount === 1 ? '' : 's'} from ${files.length} file${
            files.length === 1 ? '' : 's'
          }${importType === 'm1_finance' ? ' (M1 Finance format)' : ''}.`,
        ];
        if (newAdditions.length) {
          parts.push(
            `${newAdditions.length} new entr${
              newAdditions.length === 1 ? 'y' : 'ies'
            } ready to add.`,
          );
        } else {
          parts.push('All were duplicates.');
        }
        if (duplicateCount) {
          parts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`);
        }
        setImportStatus(parts.join(' '));
      } catch (error) {
        setImportStatus(`Failed to read file(s): ${error.message}`);
      } finally {
        setIsImportingFiles(false);
      }
    },
    [transactions],
  );

  const handleApplyImport = useCallback(() => {
    if (!pendingImport) {
      return;
    }

    const additions = pendingImport.additions || [];
    const duplicateCount = pendingImport.duplicateCount || 0;

    if (!additions.length) {
      setPendingImport(null);
      const parts = ['No new entries to import.'];
      if (duplicateCount) {
        parts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`);
      }
      setImportStatus(parts.join(' '));
      return;
    }

    const merged = sortTransactions([...transactions, ...additions]);
    setTransactions(merged);
    setPendingImport(null);
    setRawInput('');
    const parts = [`Added ${additions.length} new entr${additions.length === 1 ? 'y' : 'ies'}.`];
    if (duplicateCount) {
      parts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`);
    }
    parts.push('Local portfolio updated.');
    setImportStatus(parts.join(' '));
  }, [pendingImport, transactions]);

  const handleCancelImport = useCallback(() => {
    setPendingImport(null);
    setImportStatus('Import discarded.');
  }, []);

  const handleClear = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Clear all stored transactions?')) {
      return;
    }
    setTransactions([]);
    setPendingImport(null);
    setRawInput('');
    setImportStatus('Cleared all transactions.');
    setSyncStatus('');
    setLastSyncAt(null);
    setLastPlaidSync(null);
    setAutoImportStats({ imported: 0, duplicates: 0, lastUpdate: null });
  }, []);

  // Direct import for Plaid auto-import (bypass manual approval)
  const handleDirectImport = useCallback(async (newTransactions) => {
    console.log('📥 Direct import:', { count: newTransactions.length });

    // Enhance transactions with hash metadata if not already present
    const enhancedTransactions = newTransactions.map(tx => {
      // If transaction doesn't have hash metadata, it needs enhancement
      if (!tx.transactionHash) {
        console.warn('Transaction missing hash metadata:', tx);
        return tx; // Use as-is, hashing should have been done in PlaidTransactionManager
      }
      return tx;
    });

    // Add to existing transactions
    const merged = sortTransactions([...transactions, ...enhancedTransactions]);
    setTransactions(merged);

    // Update status
    const statusMessage = `Auto-imported ${enhancedTransactions.length} new transaction${enhancedTransactions.length === 1 ? '' : 's'}`;
    setImportStatus(statusMessage);

    // Update sync time
    setLastPlaidSync(new Date().toISOString());

    // Update auto-import stats
    setAutoImportStats(prev => ({
      imported: prev.imported + enhancedTransactions.length,
      duplicates: prev.duplicates, // This will be updated from import results
      lastUpdate: new Date().toISOString()
    }));

    console.log('✅ Direct import completed');
    return merged;
  }, [transactions]);

  // Auto-sync to GitHub after Plaid imports
  const handleAutoSync = useCallback(async () => {
    console.log('🔄 Starting auto-sync to GitHub...');
    try {
      await handleSync(); // Use existing sync function
      console.log('✅ Auto-sync completed');
    } catch (error) {
      console.error('❌ Auto-sync failed:', error);
      // Don't throw - we don't want to break the import flow
    }
  }, []);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatus('Syncing to GitHub…');

    try {
      const payload = {
        transactions,
        portfolio: summary.portfolio,
        totals: summary.totals,
        fundTotals: summary.fundTotals,
        sourceTotals: summary.sourceTotals,
        timeline: summary.timeline,
        lastUpdated: summary.lastUpdated,
        generatedAt: new Date().toISOString(),
      };

      // Validate payload structure before sending
      if (!Array.isArray(transactions)) {
        throw new Error('Transactions must be an array');
      }

      // Check for any transactions with invalid data types
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        if (!tx || typeof tx !== 'object') {
          throw new Error(`Transaction ${i} is not a valid object`);
        }
        if (typeof tx.date !== 'string' || !tx.date) {
          throw new Error(`Transaction ${i} has invalid date: ${tx.date}`);
        }
        if (typeof tx.activity !== 'string' || !tx.activity) {
          throw new Error(`Transaction ${i} has invalid activity: ${tx.activity}`);
        }
        if (typeof tx.fund !== 'string' || !tx.fund) {
          throw new Error(`Transaction ${i} has invalid fund: ${tx.fund}`);
        }
        if (typeof tx.units !== 'number' || isNaN(tx.units)) {
          throw new Error(`Transaction ${i} has invalid units: ${tx.units} (type: ${typeof tx.units})`);
        }
        if (typeof tx.unitPrice !== 'number' || isNaN(tx.unitPrice)) {
          throw new Error(`Transaction ${i} has invalid unitPrice: ${tx.unitPrice} (type: ${typeof tx.unitPrice})`);
        }
        if (typeof tx.amount !== 'number' || isNaN(tx.amount)) {
          throw new Error(`Transaction ${i} has invalid amount: ${tx.amount} (type: ${typeof tx.amount})`);
        }
      }

      const response = await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': REQUEST_AUTH_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Sync failed with status:', response.status, 'Response:', errorText);
        throw new Error(errorText || `HTTP ${response.status}: GitHub sync failed`);
      }

      setSyncStatus('Sync successful.');
      const now = new Date().toISOString();
      setLastSyncAt(now);
    } catch (error) {
      console.error('Sync failed', error);
      setSyncStatus(`Sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [summary, transactions]);

  return (
    <PlaidAuthProvider>
      <BrowserRouter>
      <div className="app">
        <header className="top-bar">
          <div className="brand">
            <div className="brand-heading">
              <h1>401k Tracker</h1>
              <p>
                Monitor your retirement portfolio with automatic account synchronization and GitHub backup.
                {summary.lastUpdated && (
                  <span className="last-update">
                    {' '}• Last updated {formatDate(summary.lastUpdated)}
                  </span>
                )}
                {!transactions.length && (
                  <span className="getting-started">
                    {' '}• Get started by connecting your first investment account
                  </span>
                )}
              </p>
            </div>
            {transactions.length ? (
              <div className="hero-metrics" aria-label="Portfolio quick metrics">
                <div className="hero-metric">
                  <span className="hero-metric-label">Market Value</span>
                  <span className="hero-metric-value">
                    {formatCurrency(summary.totals.marketValue || 0)}
                  </span>
                </div>
                <div className="hero-metric">
                  <span className="hero-metric-label">Net Contributions</span>
                  <span className="hero-metric-value">
                    {formatCurrency(summary.totals.netInvested || 0)}
                  </span>
                </div>
                <div className="hero-metric">
                  <span className="hero-metric-label">Pay Periods</span>
                  <span className="hero-metric-value">{summary.totals.payPeriods || 0}</span>
                </div>
              </div>
            ) : null}
          </div>
          <nav className="nav">
            <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')} end>
              Dashboard
            </NavLink>
            <NavLink to="/import" className={({ isActive }) => (isActive ? 'active' : '')}>
              Accounts
            </NavLink>
            {/* Temporarily hidden for demo - Settings controls APIs not yet implemented
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
              Settings
            </NavLink>
            */}
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={
<Dashboard
                  summary={summary}
                  transactions={transactions}
                  onSync={handleSync}
                  isSyncing={isSyncing}
                  syncStatus={syncStatus}
                  remoteStatus={remoteStatus}
                  onRefresh={fetchFromGitHub}
                  isRefreshing={isFetchingRemote}
                />
              }
            />
            <Route
              path="/import"
              element={(
                <ImportPage
                  rawInput={rawInput}
                  setRawInput={setRawInput}
                  onParse={handleParse}
                  onApplyImport={handleApplyImport}
                  onCancelImport={handleCancelImport}
                  onClearAll={handleClear}
                  pendingImport={pendingImport}
                  importStatus={importStatus}
                  transactionsCount={transactions.length}
                  transactions={transactions}
                  onImportFiles={handleImportFiles}
                  isImportingFiles={isImportingFiles}
                  onDirectImport={handleDirectImport}
                  onAutoSync={handleAutoSync}
                />
              )}
            />
            {/* Temporarily hidden for demo - Settings controls APIs not yet implemented
            <Route
              path="/settings"
              element={
                <Settings
                  settings={portfolioSettings}
                  onSettingChange={handleSettingChange}
                  onResetSettings={handleResetSettings}
                />
              }
            />
            */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      </BrowserRouter>
    </PlaidAuthProvider>
  );
}
