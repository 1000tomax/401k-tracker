import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { formatDate, formatCurrency } from './utils/formatters.js';
import { PlaidAuthProvider } from './contexts/PlaidAuthContext.jsx';
import HoldingsService from './services/HoldingsService.js';
import TransactionService from './services/TransactionService.js';
import VoyaService from './services/VoyaService.js';
import { aggregatePortfolio } from './utils/parseTransactions.js';
import OfflineBanner from './components/OfflineBanner.jsx';
// import InstallPrompt from './components/InstallPrompt.jsx'; // OPTIONAL: Uncomment to enable install prompt

// Lazy load route components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const Dividends = lazy(() => import('./pages/Dividends.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const FundDetail = lazy(() => import('./pages/FundDetail.jsx'));
const PerformanceDashboard = lazy(() => import('./components/PerformanceDashboard.jsx'));

// Loading fallback component
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: 'var(--text-secondary)',
    fontSize: '1rem'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '40px',
        height: '40px',
        margin: '0 auto 1rem',
        border: '3px solid var(--border-subtle)',
        borderTopColor: 'var(--blue-500)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      Loading...
    </div>
  </div>
);

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

export default function App() {
  const [holdings, setHoldings] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [totals, setTotals] = useState({ marketValue: 0, totalHoldings: 0, lastUpdated: null });
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('');

  const holdingsService = useMemo(() => new HoldingsService(API_URL, API_TOKEN), []);
  const transactionService = useMemo(() => new TransactionService(API_URL, API_TOKEN), []);
  const voyaService = useMemo(() => new VoyaService(API_URL, API_TOKEN), []);

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

      // Separate Voya transactions for special handling with live pricing
      const voyaTransactions = transactions.filter(tx =>
        tx.source_type === 'voya' ||
        tx.sourceType === 'voya' ||
        (tx.fund && tx.fund.includes('0899'))
      );

      // Exclude Voya transactions from main portfolio aggregation
      const nonVoyaTransactions = transactions.filter(tx =>
        !(tx.source_type === 'voya' || tx.sourceType === 'voya' || (tx.fund && tx.fund.includes('0899')))
      );

      // Fetch live ETF prices (for Roth IRA holdings)
      console.log('💰 Fetching live ETF prices...');
      const livePrices = await holdingsService.getLatestPrices();
      if (livePrices) {
        console.log('✅ Live prices loaded:', Object.keys(livePrices));
      } else {
        console.log('⚠️ Live prices unavailable, using transaction prices');
      }

      // Find the earliest Voya transaction date
      let voyaStartDate = null;
      if (voyaTransactions.length > 0) {
        const sortedVoyaDates = voyaTransactions
          .map(tx => tx.date || tx.activity_date)
          .filter(Boolean)
          .sort();
        voyaStartDate = sortedVoyaDates[0];
        console.log(`📅 Voya start date: ${voyaStartDate}`);
      }

      // Filter transactions to only include those from Voya start date onwards
      const filteredTransactions = voyaStartDate
        ? transactions.filter(tx => {
            const txDate = tx.date || tx.activity_date;
            return txDate >= voyaStartDate;
          })
        : transactions;

      console.log(`📊 Using ${filteredTransactions.length} transactions for timeline (from ${voyaStartDate || 'beginning'})`);

      // Aggregate ALL transactions (from Voya start date) for timeline
      const fullPortfolio = aggregatePortfolio(filteredTransactions, livePrices);

      // Aggregate non-Voya transactions for current holdings
      const portfolioNonVoya = aggregatePortfolio(
        nonVoyaTransactions.filter(tx => {
          if (!voyaStartDate) return true;
          const txDate = tx.date || tx.activity_date;
          return txDate >= voyaStartDate;
        }),
        livePrices
      );

      console.log('📊 Portfolio calculated:', {
        holdings: Object.keys(portfolioNonVoya.portfolio).length,
        marketValue: portfolioNonVoya.totals.marketValue,
        costBasis: portfolioNonVoya.totals.costBasis,
        gainLoss: portfolioNonVoya.totals.gainLoss
      });

      // Convert portfolio format to holdings format for dashboard
      const holdingsArray = convertPortfolioToHoldings(portfolioNonVoya);

      // Fetch and add Voya holdings with live pricing (grouped by source)
      if (voyaTransactions.length > 0) {
        console.log(`💼 Found ${voyaTransactions.length} Voya transactions, enriching with live pricing...`);
        const voyaHoldings = await voyaService.enrichVoyaHoldings(voyaTransactions);

        if (voyaHoldings && voyaHoldings.length > 0) {
          console.log(`✅ Added ${voyaHoldings.length} Voya holdings with live pricing`);

          // Add each Voya holding (by source) to the holdings array
          for (const voyaHolding of voyaHoldings) {
            holdingsArray.push(voyaHolding);

            // Update totals to include this Voya position
            portfolioNonVoya.totals.marketValue += voyaHolding.marketValue;
            portfolioNonVoya.totals.costBasis += voyaHolding.costBasis;
            portfolioNonVoya.totals.gainLoss += voyaHolding.gainLoss;

            // Add Voya price timestamp to priceTimestamps (use accountName as key)
            if (voyaHolding.priceTimestamp) {
              portfolioNonVoya.priceTimestamps = portfolioNonVoya.priceTimestamps || {};
              portfolioNonVoya.priceTimestamps[voyaHolding.accountName] = {
                timestamp: voyaHolding.priceTimestamp,
                source: 'live'
              };
            }
          }
        }
      }

      setHoldings(holdingsArray);
      // Use full portfolio timeline which includes all accounts from Voya start date
      setTimeline(fullPortfolio.timeline || []);
      setTotals({
        marketValue: portfolioNonVoya.totals.marketValue,
        costBasis: portfolioNonVoya.totals.costBasis,
        gainLoss: portfolioNonVoya.totals.gainLoss,
        totalHoldings: holdingsArray.length,
        lastUpdated: portfolioNonVoya.lastUpdated,
        priceTimestamps: portfolioNonVoya.priceTimestamps || {},
      });

      setStatus('');
    } catch (error) {
      console.error('❌ Error loading portfolio:', error);
      setStatus('Error loading portfolio. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [transactionService, convertPortfolioToHoldings, holdingsService, voyaService]);

  // Check if currently during US market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
  const isMarketHours = useCallback(() => {
    const now = new Date();

    // Convert to ET timezone
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etTime.getDay(); // 0 = Sunday, 6 = Saturday
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Check if weekday (Mon-Fri)
    if (day === 0 || day === 6) return false;

    // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min) ET
    return totalMinutes >= 570 && totalMinutes < 960;
  }, []);

  // Initial load
  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  // Auto-refresh prices during market hours
  useEffect(() => {
    if (!isMarketHours()) {
      console.log('🕐 Market closed - auto-refresh disabled');
      return;
    }

    console.log('📈 Market open - enabling auto-refresh every 15 minutes');

    const interval = setInterval(() => {
      if (isMarketHours()) {
        console.log('🔄 Auto-refreshing prices...');
        loadHoldings();
      } else {
        console.log('🕐 Market closed - stopping auto-refresh');
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, [loadHoldings, isMarketHours]);


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
    const priceTimestamps = totals.priceTimestamps || {};

    for (const holding of holdings) {
      const rawAccountName = holding.accountName || 'Unknown Account';
      const accountName = formatAccountName(rawAccountName);

      // Get price timestamp info for this account
      const priceInfo = priceTimestamps[rawAccountName] || null;

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
            priceInfo,
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
            priceInfo,
          });
        }

        const account = grouped.get(accountName);
        account.holdings.push(holding);
        account.totalValue += holding.marketValue;
      }
    }

    // If we have Voya sources, combine them into one account
    if (voyaSources.size > 0) {
      // Find the most recent price info from all Voya sources
      let mostRecentPriceInfo = null;
      for (const source of voyaSources.values()) {
        if (source.priceInfo && (!mostRecentPriceInfo || source.priceInfo.timestamp > mostRecentPriceInfo.timestamp)) {
          mostRecentPriceInfo = source.priceInfo;
        }
      }

      const combinedVoya = {
        accountName: 'Voya 401(k)',
        holdings: [],
        totalValue: 0,
        sources: Array.from(voyaSources.values()),
        isCollapsible: true, // Flag to indicate this account can be expanded
        priceInfo: mostRecentPriceInfo,
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

    // Sort holdings within each account by market value (highest first)
    for (const account of grouped.values()) {
      account.holdings.sort((a, b) => b.marketValue - a.marketValue);
    }

    return Array.from(grouped.values());
  }, [holdings, totals]);

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
        <OfflineBanner />
        {/* <InstallPrompt /> */} {/* OPTIONAL: Uncomment to enable install prompt */}

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
                    <span className="hero-metric-label">Cost Basis</span>
                    <span className="hero-metric-value">
                      {formatCurrency(totals.costBasis || 0)}
                    </span>
                  </div>
                  <div className="hero-metric">
                    <span className="hero-metric-label">Market Value</span>
                    <span className="hero-metric-value">
                      {formatCurrency(totals.marketValue || 0)}
                    </span>
                  </div>
                  <div className="hero-metric">
                    <span className="hero-metric-label">Gain/Loss</span>
                    <span className={`hero-metric-value ${(totals.gainLoss || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(totals.gainLoss || 0)}
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
              <NavLink to="/dividends" className={({ isActive }) => (isActive ? 'active' : '')}>
                Dividends
              </NavLink>
              <NavLink to="/transactions" className={({ isActive }) => (isActive ? 'active' : '')}>
                Transactions
              </NavLink>
              {import.meta.env.DEV && (
                <NavLink to="/performance" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Performance
                </NavLink>
              )}
            </nav>
          </header>

          <main className="app-main">
            {status && (
              <div className="status-message">
                {status}
              </div>
            )}

            <Suspense fallback={<PageLoader />}>
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
                <Route path="/dividends" element={<Dividends />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/fund/:ticker" element={<FundDetail />} />
                {import.meta.env.DEV && (
                  <Route path="/performance" element={<PerformanceDashboard />} />
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </PlaidAuthProvider>
  );
}