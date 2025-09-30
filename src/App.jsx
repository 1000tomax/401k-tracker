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

// Transaction data is now stored in Supabase database, not localStorage

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [rawInput, setRawInput] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [isImportingFiles, setIsImportingFiles] = useState(false);

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

  // Load transactions from database on mount
  useEffect(() => {
    const loadTransactionsFromDatabase = async () => {
      try {
        console.log('🔄 Loading transactions from database...');
        const PlaidDatabaseService = (await import('./services/PlaidDatabaseService')).default;

        const data = await PlaidDatabaseService.getTransactions({ limit: 10000 });

        if (data.transactions && data.transactions.length > 0) {
          console.log('✅ Loaded transactions from database:', data.transactions.length);
          setTransactions(data.transactions);
          setImportStatus(`Loaded ${data.transactions.length} transactions from database`);
        } else {
          console.log('ℹ️ No transactions in database yet');
          setImportStatus('Ready for Plaid account connections');
        }
      } catch (error) {
        console.error('❌ Failed to load transactions from database:', error);
        setImportStatus('Ready for Plaid account connections');
      }
    };

    // Load transactions from database
    loadTransactionsFromDatabase();
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
  }, [portfolioSettings.multiAccountMode, transactions, summary, userSettingsForPortfolio]);

  // Transaction persistence removed - now using Supabase database instead of localStorage

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

  // GitHub sync removed - using Supabase database instead

  return (
    <PlaidAuthProvider>
      <BrowserRouter>
      <div className="app">
        <header className="top-bar">
          <div className="brand">
            <div className="brand-heading">
              <h1>401k Tracker</h1>
              <p>
                Monitor your retirement portfolio with automatic Plaid account synchronization and secure database storage.
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
                  <span className="hero-metric-label">Portfolio Value</span>
                  <span className="hero-metric-value">
                    {formatCurrency(summary.totals.marketValue || 0)}
                  </span>
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
