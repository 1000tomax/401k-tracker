import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import { formatDate, formatCurrency } from './utils/formatters.js';
import { PlaidAuthProvider } from './contexts/PlaidAuthContext.jsx';
import HoldingsService from './services/HoldingsService.js';
import TransactionService from './services/TransactionService.js';
import { aggregatePortfolio } from './utils/parseTransactions.js';

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
  const transactionService = useMemo(() => new TransactionService(API_URL, API_TOKEN), []);

  // Helper: Convert portfolio to holdings array
  const convertPortfolioToHoldings = useCallback((portfolio) => {
    const holdings = [];

    for (const [fund, sources] of Object.entries(portfolio.portfolio || {})) {
      for (const [source, position] of Object.entries(sources)) {
        if (!position.isClosed && Math.abs(position.shares) > 0.0001) {
          holdings.push({
            fund,
            accountName: source,
            shares: position.shares,
            marketValue: position.marketValue,
            costBasis: position.costBasis,
            gainLoss: position.gainLoss,
            avgCost: position.avgCost,
            latestNAV: position.latestNAV,
          });
        }
      }
    }

    return holdings;
  }, []);

  // Load holdings from transactions
  const loadHoldings = useCallback(async () => {
    try {
      console.log('📊 Loading portfolio from transactions...');
      setIsLoading(true);

      // Fetch all transactions
      const transactions = await transactionService.getAllTransactions();

      console.log('📥 Loaded transactions:', transactions.length);

      if (transactions.length === 0) {
        console.log('ℹ️ No transactions found');
        setHoldings([]);
        setTimeline([]);
        setTotals({ marketValue: 0, costBasis: 0, gainLoss: 0, totalHoldings: 0, lastUpdated: null });
        setStatus('');
        return;
      }

      // Aggregate into portfolio
      const portfolio = aggregatePortfolio(transactions);

      console.log('📊 Portfolio calculated:', {
        holdings: Object.keys(portfolio.portfolio).length,
        marketValue: portfolio.totals.marketValue,
        costBasis: portfolio.totals.costBasis,
        gainLoss: portfolio.totals.gainLoss
      });

      // Convert portfolio format to holdings format for dashboard
      const holdingsArray = convertPortfolioToHoldings(portfolio);

      setHoldings(holdingsArray);
      setTimeline(portfolio.timeline || []);
      setTotals({
        marketValue: portfolio.totals.marketValue,
        costBasis: portfolio.totals.costBasis,
        gainLoss: portfolio.totals.gainLoss,
        totalHoldings: holdingsArray.length,
        lastUpdated: portfolio.lastUpdated,
      });

      setStatus('');
    } catch (error) {
      console.error('❌ Error loading portfolio:', error);
      setStatus('Error loading portfolio. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [transactionService, convertPortfolioToHoldings]);

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
    const lower = cleanName.toLowerCase();

    // Map account names to clean display names

    // Roth IRA
    if (lower.includes('roth') && lower.includes('ira')) {
      return 'Roth IRA';
    }

    // Voya 401(k) sources - map various formats to standardized names
    // Matches: "Safe Harbor Match", "Employee PreTax", "ROTH", etc.
    if (lower.includes('pretax') || lower.includes('pre-tax') || lower === 'employee pretax') {
      return 'Voya 401(k) (PreTax)';
    }
    if (lower.includes('match') || lower === 'safe harbor match') {
      return 'Voya 401(k) (Match)';
    }
    // Check for standalone "ROTH" (not Roth IRA)
    if (lower === 'roth' || (lower.includes('roth') && !lower.includes('ira'))) {
      return 'Voya 401(k) (Roth)';
    }

    // Legacy format with 401(k) in the name
    if (cleanName.includes('401(K)') || cleanName.includes('401k')) {
      const sourceMatch = cleanName.match(/\(([^)]+)\)$/);
      if (sourceMatch) {
        const source = sourceMatch[1];
        if (source.toLowerCase().includes('pretax')) {
          return 'Voya 401(k) (PreTax)';
        } else if (source.toLowerCase().includes('roth')) {
          return 'Voya 401(k) (Roth)';
        } else if (source.toLowerCase().includes('match')) {
          return 'Voya 401(k) (Match)';
        }
      }
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
            existingHolding.costBasis += holding.costBasis;
            existingHolding.gainLoss += holding.gainLoss;
            // Use the most recent NAV (latest holding should have it)
            if (holding.latestNAV) {
              existingHolding.latestNAV = holding.latestNAV;
            }
            // Recalculate weighted average cost
            existingHolding.avgCost = existingHolding.shares > 0
              ? existingHolding.costBasis / existingHolding.shares
              : 0;
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