import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import { formatDate, formatCurrency } from './utils/formatters.js';
import { PlaidAuthProvider } from './contexts/PlaidAuthContext.jsx';
import HoldingsService from './services/HoldingsService.js';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

export default function App() {
  const [holdings, setHoldings] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [totals, setTotals] = useState({ marketValue: 0, totalHoldings: 0, lastUpdated: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState('');

  const holdingsService = useMemo(() => new HoldingsService(API_URL, API_TOKEN), []);

  // Load holdings on mount
  const loadHoldings = useCallback(async () => {
    try {
      console.log('📊 Loading holdings snapshots...');
      setIsLoading(true);

      const data = await holdingsService.getSnapshots(90);

      if (data.ok) {
        setHoldings(data.currentHoldings || []);
        setTimeline(data.timeline || []);
        setTotals(data.totals || { marketValue: 0, totalHoldings: 0, lastUpdated: null });
        console.log('✅ Holdings loaded:', {
          holdings: data.currentHoldings?.length,
          timeline: data.timeline?.length
        });

        // Clear status message on successful load
        setStatus('');
      } else {
        console.error('❌ Failed to load holdings:', data.error);
        setStatus('Failed to load holdings. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error loading holdings:', error);
      setStatus('Error loading holdings. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [holdingsService]);

  // Initial load
  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  // Manual sync
  const handleSync = useCallback(async () => {
    try {
      console.log('🔄 Triggering manual holdings sync...');
      setIsSyncing(true);
      setStatus('Syncing holdings from Plaid...');

      const result = await holdingsService.syncNow();

      if (result.ok) {
        console.log('✅ Sync complete:', result);
        setStatus(`Sync complete! ${result.synced} holdings updated.`);

        // Reload holdings after sync
        await loadHoldings();
      } else {
        console.error('❌ Sync failed:', result.error);
        setStatus(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      setStatus(`Sync error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [holdingsService, loadHoldings]);

  // Account name mapping for display
  const formatAccountName = (name) => {
    const cleanName = name || 'Unknown Account';

    // Map account names to clean display names

    // Roth IRA
    if (cleanName.toLowerCase().includes('roth') && cleanName.toLowerCase().includes('ira')) {
      return 'Roth IRA';
    }

    // Voya 401(k) - keep the source in parentheses for granular tracking
    // "AUTOMATED HEALTH SYSTEMS 401(K) (Employee PreTax)" -> "Voya 401(k) (PreTax)"
    // "AUTOMATED HEALTH SYSTEMS 401(K) (ROTH)" -> "Voya 401(k) (Roth)"
    // "AUTOMATED HEALTH SYSTEMS 401(K) (Safe Harbor Match)" -> "Voya 401(k) (Match)"
    if (cleanName.includes('401(K)') || cleanName.includes('401k')) {
      // Extract the source from parentheses
      const sourceMatch = cleanName.match(/\(([^)]+)\)$/);
      if (sourceMatch) {
        const source = sourceMatch[1];

        // Clean up source names
        if (source.toLowerCase().includes('pretax')) {
          return 'Voya 401(k) (PreTax)';
        } else if (source.toLowerCase().includes('roth')) {
          return 'Voya 401(k) (Roth)';
        } else if (source.toLowerCase().includes('match')) {
          return 'Voya 401(k) (Match)';
        }
      }

      // Fallback if no source found
      return 'Voya 401(k)';
    }

    return cleanName;
  };

  // Group holdings by account for display
  const holdingsByAccount = useMemo(() => {
    const grouped = new Map();
    const voyaSources = new Map(); // Track Voya sources separately

    for (const holding of holdings) {
      const rawAccountName = holding.accountName || 'Unknown Account';
      const accountName = formatAccountName(rawAccountName);

      // Check if this is a Voya account with a source
      const isVoya = accountName.startsWith('Voya 401(k)');
      const voyaSourceMatch = accountName.match(/Voya 401\(k\) \((.+)\)/);

      if (isVoya && voyaSourceMatch) {
        // This is a Voya source account - group under "Voya 401(k)"
        const source = voyaSourceMatch[1]; // PreTax, Roth, or Match

        if (!voyaSources.has(source)) {
          voyaSources.set(source, {
            source,
            holdings: [],
            totalValue: 0,
          });
        }

        const voyaSource = voyaSources.get(source);
        voyaSource.holdings.push(holding);
        voyaSource.totalValue += holding.marketValue;
      } else {
        // Regular account (not Voya or no source)
        if (!grouped.has(accountName)) {
          grouped.set(accountName, {
            accountName,
            holdings: [],
            totalValue: 0,
          });
        }

        const account = grouped.get(accountName);
        account.holdings.push(holding);
        account.totalValue += holding.marketValue;
      }
    }

    // If we have Voya sources, combine them into one account
    if (voyaSources.size > 0) {
      const combinedVoya = {
        accountName: 'Voya 401(k)',
        holdings: [],
        totalValue: 0,
        sources: Array.from(voyaSources.values()),
        isCollapsible: true, // Flag to indicate this account can be expanded
      };

      // Combine all holdings from all sources
      for (const source of voyaSources.values()) {
        combinedVoya.totalValue += source.totalValue;

        // Merge holdings with same fund
        for (const holding of source.holdings) {
          const existingHolding = combinedVoya.holdings.find(h => h.fund === holding.fund);
          if (existingHolding) {
            existingHolding.shares += holding.shares;
            existingHolding.marketValue += holding.marketValue;
          } else {
            combinedVoya.holdings.push({ ...holding });
          }
        }
      }

      grouped.set('Voya 401(k)', combinedVoya);
    }

    return Array.from(grouped.values());
  }, [holdings]);

  // Portfolio summary for dashboard
  const summary = useMemo(() => {
    return {
      totals,
      timeline,
      holdings,
      holdingsByAccount,
      lastUpdated: totals.lastUpdated,
    };
  }, [totals, timeline, holdings, holdingsByAccount]);

  return (
    <PlaidAuthProvider>
      <BrowserRouter>
        <div className="app">
          <header className="top-bar">
            <div className="brand">
              <div className="brand-heading">
                <h1>401k Tracker</h1>
                <p>
                  Monitor your retirement portfolio with automatic daily synchronization.
                  {totals.lastUpdated && (
                    <span className="last-update">
                      {' '}• Last updated {formatDate(totals.lastUpdated)}
                    </span>
                  )}
                  {!holdings.length && !isLoading && (
                    <span className="getting-started">
                      {' '}• Connect your Plaid account to get started
                    </span>
                  )}
                </p>
              </div>
              {holdings.length > 0 && (
                <div className="hero-metrics" aria-label="Portfolio quick metrics">
                  <div className="hero-metric">
                    <span className="hero-metric-label">Portfolio Value</span>
                    <span className="hero-metric-value">
                      {formatCurrency(totals.marketValue || 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <nav className="nav">
              <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')} end>
                Dashboard
              </NavLink>
              <NavLink to="/accounts" className={({ isActive }) => (isActive ? 'active' : '')}>
                Accounts
              </NavLink>
              <button
                type="button"
                className="nav-button"
                onClick={handleSync}
                disabled={isSyncing}
                title="Sync Plaid accounts (Voya must be updated manually)"
              >
                {isSyncing ? 'Syncing Plaid...' : 'Sync Plaid'}
              </button>
            </nav>
          </header>

          <main className="app-main">
            {status && (
              <div className="status-message">
                {status}
              </div>
            )}

            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    summary={summary}
                    isLoading={isLoading}
                  />
                }
              />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </PlaidAuthProvider>
  );
}