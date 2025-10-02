import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import TransactionService from '../services/TransactionService.js';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [accountFilter, setAccountFilter] = useState('all');
  const [tickerFilter, setTickerFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const transactionService = useMemo(() => new TransactionService(API_URL, API_TOKEN), []);

  // Load transactions
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await transactionService.getAllTransactions();
        // Sort by date descending (newest first)
        data.sort((a, b) => new Date(b.date) - new Date(a.date));
        setTransactions(data);
      } catch (err) {
        console.error('Failed to load transactions:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadTransactions();
  }, [transactionService]);

  // Get unique accounts and tickers for filters
  const { accounts, tickers } = useMemo(() => {
    const accountSet = new Set();
    const tickerSet = new Set();

    transactions.forEach(tx => {
      if (tx.money_source) accountSet.add(tx.money_source);
      if (tx.fund) tickerSet.add(tx.fund);
    });

    return {
      accounts: Array.from(accountSet).sort(),
      tickers: Array.from(tickerSet).sort()
    };
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Account filter
      if (accountFilter !== 'all' && tx.money_source !== accountFilter) {
        return false;
      }

      // Ticker filter
      if (tickerFilter !== 'all' && tx.fund !== tickerFilter) {
        return false;
      }

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fund = (tx.fund || '').toLowerCase();
        const account = (tx.money_source || '').toLowerCase();
        const activity = (tx.activity || '').toLowerCase();

        if (!fund.includes(query) && !account.includes(query) && !activity.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, accountFilter, tickerFilter, searchQuery]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const totalBuys = filteredTransactions
      .filter(tx => tx.activity?.toLowerCase() === 'buy')
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    const totalSells = filteredTransactions
      .filter(tx => tx.activity?.toLowerCase() === 'sell')
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    return {
      totalTransactions: filteredTransactions.length,
      totalBuys,
      totalSells,
      netInvested: totalBuys - totalSells
    };
  }, [filteredTransactions]);

  // Helper function to format account names
  const formatAccountName = (accountName) => {
    if (!accountName) return 'Unknown';

    if (accountName.toLowerCase().includes('roth') && accountName.toLowerCase().includes('ira')) {
      return 'Roth IRA';
    }

    if (accountName.toLowerCase().includes('pretax')) {
      return 'Voya 401(k) (PreTax)';
    }
    if (accountName.toLowerCase().includes('match')) {
      return 'Voya 401(k) (Match)';
    }
    if (accountName === 'ROTH' || (accountName.toLowerCase().includes('roth') && !accountName.toLowerCase().includes('ira'))) {
      return 'Voya 401(k) (Roth)';
    }

    return accountName;
  };

  // Helper function to format fund names
  const formatFundName = (fund) => {
    if (!fund) return '—';
    if (fund.includes('Vanguard 500')) return 'VAN 500';
    return fund;
  };

  if (isLoading) {
    return (
      <div className="transactions-page">
        <div className="loading-state">
          <p>Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transactions-page">
        <section>
          <div className="section-header">
            <h2>Transaction History</h2>
          </div>
          <div className="empty-state">
            <p className="meta">Failed to load transactions</p>
            <p>{error}</p>
          </div>
        </section>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="transactions-page">
        <section>
          <div className="section-header">
            <h2>Transaction History</h2>
          </div>
          <div className="empty-state">
            <p className="meta">No transactions found</p>
            <p className="demo-description">
              Transactions will appear here after syncing your accounts via Plaid.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="transactions-page">
      <section>
        <div className="section-header">
          <h2>Transaction History</h2>
          <p className="meta">Complete transaction history from all connected accounts.</p>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <p className="summary-card-label">Total Transactions</p>
            <p className="summary-card-value">{summary.totalTransactions}</p>
          </div>
          <div className="summary-card">
            <p className="summary-card-label">Total Buys</p>
            <p className="summary-card-value">{formatCurrency(summary.totalBuys)}</p>
          </div>
          <div className="summary-card">
            <p className="summary-card-label">Total Sells</p>
            <p className="summary-card-value">{formatCurrency(summary.totalSells)}</p>
          </div>
          <div className="summary-card">
            <p className="summary-card-label">Net Invested</p>
            <p className="summary-card-value">{formatCurrency(summary.netInvested)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="transaction-filters">
          <div className="filter-group">
            <label htmlFor="account-filter">Account</label>
            <select
              id="account-filter"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Accounts</option>
              {accounts.map(account => (
                <option key={account} value={account}>
                  {formatAccountName(account)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="ticker-filter">Fund</label>
            <select
              id="ticker-filter"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Funds</option>
              {tickers.map(ticker => (
                <option key={ticker} value={ticker}>
                  {formatFundName(ticker)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="text"
              placeholder="Search fund, account, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-input"
            />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="table-wrapper">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Fund</th>
                <th>Account</th>
                <th className="numeric">Shares</th>
                <th className="numeric">Price</th>
                <th className="numeric">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx, index) => (
                <tr key={tx.id || index}>
                  <td>{formatDate(tx.date)}</td>
                  <td>
                    <span className={`transaction-type ${tx.activity?.toLowerCase()}`}>
                      {tx.activity}
                    </span>
                  </td>
                  <td>{formatFundName(tx.fund)}</td>
                  <td>{formatAccountName(tx.money_source)}</td>
                  <td className="numeric">{tx.units?.toFixed(4) || '—'}</td>
                  <td className="numeric">{tx.unit_price ? formatCurrency(tx.unit_price) : '—'}</td>
                  <td className="numeric">{formatCurrency(tx.amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="empty-state">
            <p>No transactions match your filters</p>
          </div>
        )}
      </section>
    </div>
  );
}
