import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import ImportPage from './pages/Import.jsx';
import { parseTransactions, aggregatePortfolio } from './utils/parseTransactions.js';
import { formatDate, formatCurrency } from './utils/formatters.js';

const STORAGE_KEY = '401k-tracker-data';
const STORAGE_VERSION = 1;
const SNAPSHOT_ENDPOINT = '/api/snapshot';
const CLIENT_SHARED_TOKEN =
  (import.meta.env && import.meta.env.VITE_401K_TOKEN) ||
  (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_401K_TOKEN : undefined) ||
  '';
const REQUEST_AUTH_HEADER = CLIENT_SHARED_TOKEN || 'dev-only-token';

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
    return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null, navOverrides: {} };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null, navOverrides: {} };
    }

    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION) {
      return {
        version: STORAGE_VERSION,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        lastSyncAt: parsed.lastSyncAt || null,
        navOverrides: sanitizeOverrides(parsed.navOverrides),
      };
    }

    return {
      version: STORAGE_VERSION,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      lastSyncAt: parsed.lastSyncAt || null,
      navOverrides: sanitizeOverrides(parsed.navOverrides),
    };
  } catch (error) {
    console.error('Failed to load stored data', error);
    return { version: STORAGE_VERSION, transactions: [], lastSyncAt: null, navOverrides: {} };
  }
}

function sanitizeOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return {};
  const cleaned = {};
  for (const [fund, value] of Object.entries(overrides)) {
    if (typeof value === 'string') {
      cleaned[fund] = value;
    } else if (Number.isFinite(value)) {
      cleaned[fund] = String(value);
    }
  }
  return cleaned;
}

function saveData({ transactions, lastSyncAt, navOverrides }) {
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
        navOverrides: sanitizeOverrides(navOverrides),
      }),
    );
  } catch (error) {
    console.error('Failed to persist tracker data', error);
  }
}

function applyNavOverrides(summary, rawOverrides) {
  if (!summary) return summary;

  const overrides = {};
  for (const [fund, value] of Object.entries(rawOverrides || {})) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides[fund] = parsed;
    }
  }

  if (!Object.keys(overrides).length) {
    return summary;
  }

  const clone = {
    ...summary,
    totals: {
      ...summary.totals,
      marketValue: 0,
      gainLoss: 0,
      roi: 0,
    },
    portfolio: {},
    fundTotals: {},
    sourceTotals: {},
  };

  for (const [fund, baseTotals] of Object.entries(summary.fundTotals || {})) {
    clone.fundTotals[fund] = {
      ...baseTotals,
      marketValue: 0,
      gainLoss: 0,
    };
  }

  for (const [source, baseTotals] of Object.entries(summary.sourceTotals || {})) {
    clone.sourceTotals[source] = {
      ...baseTotals,
      marketValue: 0,
      gainLoss: 0,
      roi: 0,
    };
  }

  let totalMarketValue = 0;
  let totalGainLoss = 0;

  for (const [fund, sources] of Object.entries(summary.portfolio || {})) {
    const overrideNav = overrides[fund];
    const fundClone = {};
    let fundMarketValue = 0;
    let fundGainLoss = 0;

    for (const [source, metrics] of Object.entries(sources)) {
      const navToUse = Number.isFinite(overrideNav) ? overrideNav : metrics.latestNAV;
      const marketValue = metrics.shares * navToUse;
      const gainLoss = marketValue - metrics.costBasis;

      fundClone[source] = {
        ...metrics,
        latestNAV: navToUse,
        marketValue,
        gainLoss,
      };

      fundMarketValue += marketValue;
      fundGainLoss += gainLoss;

      if (!clone.sourceTotals[source]) {
        clone.sourceTotals[source] = {
          shares: metrics.shares,
          costBasis: metrics.costBasis,
          marketValue: 0,
          gainLoss: 0,
          avgCost: metrics.shares ? metrics.costBasis / metrics.shares : 0,
          contributions: 0,
          netInvested: 0,
          roi: 0,
        };
      }

      clone.sourceTotals[source].marketValue += marketValue;
      clone.sourceTotals[source].gainLoss += gainLoss;
    }

    clone.portfolio[fund] = fundClone;

    if (!clone.fundTotals[fund]) {
      clone.fundTotals[fund] = {
        shares: summary.fundTotals?.[fund]?.shares ?? 0,
        costBasis: summary.fundTotals?.[fund]?.costBasis ?? 0,
        marketValue: 0,
        gainLoss: 0,
        avgCost: summary.fundTotals?.[fund]?.avgCost ?? 0,
      };
    }

    clone.fundTotals[fund].marketValue = fundMarketValue;
    clone.fundTotals[fund].gainLoss = fundGainLoss;
    clone.fundTotals[fund].avgCost = clone.fundTotals[fund].shares
      ? clone.fundTotals[fund].costBasis / clone.fundTotals[fund].shares
      : 0;

    totalMarketValue += fundMarketValue;
    totalGainLoss += fundGainLoss;
  }

  for (const sourceTotals of Object.values(clone.sourceTotals)) {
    sourceTotals.roi = sourceTotals.netInvested
      ? (sourceTotals.marketValue - sourceTotals.netInvested) / sourceTotals.netInvested
      : 0;
  }

  clone.totals.marketValue = totalMarketValue;
  clone.totals.gainLoss = totalGainLoss;
  clone.totals.roi = clone.totals.netInvested
    ? clone.totals.gainLoss / clone.totals.netInvested
    : 0;

  return clone;
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
  const [navOverrides, setNavOverrides] = useState({});

  useEffect(() => {
    const stored = loadData();
    if (stored.transactions?.length) {
      setTransactions(sortTransactions(stored.transactions));
    }
    if (stored.lastSyncAt) {
      setLastSyncAt(stored.lastSyncAt);
    }
    if (stored.navOverrides) {
      setNavOverrides(stored.navOverrides);
    }
  }, []);

  const baseSummary = useMemo(() => aggregatePortfolio(transactions), [transactions]);
  const summary = useMemo(
    () => applyNavOverrides(baseSummary, navOverrides),
    [baseSummary, navOverrides],
  );

  useEffect(() => {
    saveData({ transactions, lastSyncAt, navOverrides });
  }, [transactions, lastSyncAt, navOverrides]);

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
    fetchFromGitHub();
  }, [fetchFromGitHub]);

  const handleParse = useCallback(() => {
    const parsed = parseTransactions(rawInput);
    if (!parsed.length) {
      setImportStatus('No transactions detected. Check the input format.');
      setPendingImport(null);
      return;
    }

    const existingKeys = new Set(transactions.map(hashTransaction));
    const batchKeys = new Set();
    const additions = [];
    const duplicates = [];

    for (const tx of parsed) {
      const key = hashTransaction(tx);
      if (existingKeys.has(key) || batchKeys.has(key)) {
        duplicates.push(tx);
        continue;
      }
      batchKeys.add(key);
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
    setNavOverrides({});
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

      const response = await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': REQUEST_AUTH_HEADER,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'GitHub sync failed');
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

  const handleNavOverrideChange = useCallback((fund, value) => {
    setNavOverrides(prev => {
      const next = { ...prev };
      if (value === '' || value == null) {
        delete next[fund];
      } else {
        next[fund] = value;
      }
      return next;
    });
  }, []);

  const handleResetNavOverrides = useCallback(() => {
    setNavOverrides({});
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <header className="top-bar">
          <div className="brand">
            <div className="brand-heading">
              <h1>401k Tracker</h1>
              <p>
                Monitor your retirement portfolio, sync snapshots to GitHub, and import Voya logs when needed.
              </p>
            </div>
            <div className="brand-indicators">
              {summary.lastUpdated && (
                <span className="status-chip status-chip--accent" role="status">
                  <span className="status-chip-label">Last Update</span>
                  <span className="status-chip-value">{formatDate(summary.lastUpdated)}</span>
                </span>
              )}
              {!transactions.length && (
                <span className="status-chip status-chip--muted" role="status">
                  <span className="status-chip-label">Getting Started</span>
                  <span className="status-chip-value">Import your first Voya log</span>
                </span>
              )}
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
              Add Transactions
            </NavLink>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={(
                <Dashboard
                  summary={summary}
                  transactions={transactions}
                  onSync={handleSync}
                  isSyncing={isSyncing}
                  syncStatus={syncStatus}
                  remoteStatus={remoteStatus}
                  onRefresh={fetchFromGitHub}
                  isRefreshing={isFetchingRemote}
                  navOverrides={navOverrides}
                  onNavOverrideChange={handleNavOverrideChange}
                  onResetNavOverrides={handleResetNavOverrides}
                />
              )}
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
                />
              )}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
