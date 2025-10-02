import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import DividendService from '../services/DividendService.js';
import HoldingsService from '../services/HoldingsService.js';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

// Helper function to clean up account names
const formatAccountName = (accountName) => {
  if (accountName?.toLowerCase().includes('roth') && accountName?.toLowerCase().includes('ira')) {
    return 'Roth IRA';
  }
  return accountName;
};

export default function Dividends() {
  const [dividends, setDividends] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeFilter, setTimeFilter] = useState('all'); // all, ytd, 12m, 6m

  const dividendService = useMemo(() => new DividendService(API_URL, API_TOKEN), []);
  const holdingsService = useMemo(() => new HoldingsService(API_URL, API_TOKEN), []);

  // Load dividends and prices
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load dividends and prices in parallel
        const [dividendsData, pricesData] = await Promise.all([
          dividendService.getAllDividends(),
          holdingsService.getLatestPrices()
        ]);

        setDividends(dividendsData);
        setLivePrices(pricesData || {});
      } catch (err) {
        console.error('Failed to load dividends:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [dividendService, holdingsService]);

  // Filter dividends by time period
  const filteredDividends = useMemo(() => {
    if (timeFilter === 'all') return dividends;

    const now = new Date();
    let startDate;

    switch (timeFilter) {
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '12m':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '6m':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      default:
        return dividends;
    }

    return dividends.filter(d => new Date(d.date) >= startDate);
  }, [dividends, timeFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const total = filteredDividends.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const ytd = dividendService.calculateYTD(dividends);
    const ttm = dividendService.calculateTTM(dividends);
    const projected = dividendService.calculateProjectedAnnual(dividends);

    const byFund = dividendService.aggregateByFund(filteredDividends);
    const byAccount = dividendService.aggregateByAccount(filteredDividends);

    // Calculate yields and frequencies
    const yields = dividendService.calculateYields(dividends, livePrices);
    const frequencies = dividendService.detectPaymentFrequencies(dividends);

    return {
      total,
      ytd,
      ttm,
      projected,
      count: filteredDividends.length,
      byFund,
      byAccount,
      yields,
      frequencies,
      averagePayment: filteredDividends.length > 0 ? total / filteredDividends.length : 0
    };
  }, [filteredDividends, dividends, livePrices, dividendService]);

  // Cumulative dividend timeline
  const cumulativeTimeline = useMemo(() => {
    const timeline = dividendService.calculateCumulativeTimeline(filteredDividends);
    return timeline;
  }, [filteredDividends, dividendService]);

  // Monthly aggregated dividends for bar chart
  const monthlyData = useMemo(() => {
    const byMonth = dividendService.aggregateByMonth(filteredDividends);
    return byMonth.map(m => ({
      month: m.month,
      amount: m.totalAmount,
      count: m.count
    }));
  }, [filteredDividends, dividendService]);

  // Top dividend-paying funds
  const topFunds = useMemo(() => {
    return Object.values(summary.byFund)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);
  }, [summary.byFund]);

  const tickFormatter = value => {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) {
      return null;
    }

    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        <ul>
          {payload.map((item, index) => (
            <li key={index}>
              <span className="dot" style={{ background: item.color || item.stroke }} />
              <span className="name">{item.name === 'amount' ? 'Dividend' : item.name}</span>
              <span className="value">{formatCurrency(item.value ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="dividends-page">
        <div className="loading-state">
          <p>Loading dividend data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dividends-page">
        <div className="error-state">
          <p>Error loading dividends: {error}</p>
        </div>
      </div>
    );
  }

  if (dividends.length === 0) {
    return (
      <div className="dividends-page">
        <section>
          <div className="section-header">
            <h2>Dividend Income</h2>
          </div>
          <div className="empty-state">
            <p className="meta">No dividend data yet. Dividends will appear here once your Plaid connection imports them.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dividends-page">
      {/* Summary Cards */}
      <section>
        <div className="section-header">
          <h2>Dividend Income Summary</h2>
          {/* Temporarily hidden - will be useful once we have more dividend history */}
          {/* <div className="time-filter-buttons">
            <button
              className={timeFilter === 'all' ? 'active' : ''}
              onClick={() => setTimeFilter('all')}
            >
              All Time
            </button>
            <button
              className={timeFilter === 'ytd' ? 'active' : ''}
              onClick={() => setTimeFilter('ytd')}
            >
              YTD
            </button>
            <button
              className={timeFilter === '12m' ? 'active' : ''}
              onClick={() => setTimeFilter('12m')}
            >
              12 Months
            </button>
            <button
              className={timeFilter === '6m' ? 'active' : ''}
              onClick={() => setTimeFilter('6m')}
            >
              6 Months
            </button>
          </div> */}
        </div>

        <div className="summary-cards">
          <div className="summary-card positive">
            <h3 className="summary-card-label">Total Dividends</h3>
            <p className="summary-card-value">{formatCurrency(summary.total)}</p>
            <p className="summary-card-helper">{summary.count} payments</p>
          </div>

          <div className="summary-card positive">
            <h3 className="summary-card-label">Year-to-Date</h3>
            <p className="summary-card-value">{formatCurrency(summary.ytd)}</p>
            <p className="summary-card-helper">{new Date().getFullYear()}</p>
          </div>

          <div className="summary-card positive">
            <h3 className="summary-card-label">Trailing 12 Months</h3>
            <p className="summary-card-value">{formatCurrency(summary.ttm)}</p>
            <p className="summary-card-helper">Last 12 months</p>
          </div>

          <div className="summary-card">
            <h3 className="summary-card-label">Average Payment</h3>
            <p className="summary-card-value">{formatCurrency(summary.averagePayment)}</p>
            <p className="summary-card-helper">Per dividend</p>
          </div>

          <div className="summary-card positive">
            <h3 className="summary-card-label">Projected Annual</h3>
            <p className="summary-card-value">{formatCurrency(summary.projected)}</p>
            <p className="summary-card-helper">Based on TTM</p>
          </div>
        </div>
      </section>

      {/* Cumulative Dividend Growth Chart */}
      <section>
        <div className="section-header">
          <h2>Cumulative Dividend Income</h2>
          <p className="section-description">Track your growing passive income over time</p>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cumulativeTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                stroke="#888"
                tickFormatter={(date) => {
                  const d = new Date(date);
                  // Smart formatting based on date format
                  if (date.length === 7) {
                    // Month format (YYYY-MM)
                    return `${d.getMonth() + 1}/${d.getFullYear() % 100}`;
                  } else {
                    // Day or week format (YYYY-MM-DD)
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }
                }}
              />
              <YAxis stroke="#888" tickFormatter={tickFormatter} />
              <Tooltip content={renderTooltip} />
              <Legend />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Dividends"
                stroke="#4ade80"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Monthly Dividend Income Chart */}
      {monthlyData.length > 0 && (
        <section>
          <div className="section-header">
            <h2>Monthly Dividend Income</h2>
            <p className="section-description">See when dividends are paid throughout the year</p>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="month" stroke="#888" />
                <YAxis stroke="#888" tickFormatter={tickFormatter} />
                <Tooltip content={renderTooltip} />
                <Legend />
                <Bar dataKey="amount" name="Monthly Dividends" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Top Dividend Funds */}
      <section>
        <div className="section-header">
          <h2>Top Dividend-Paying Holdings</h2>
          <p className="section-description">Which investments generate the most passive income</p>
        </div>

        <div className="dividend-table">
          <table>
            <thead>
              <tr>
                <th>Fund</th>
                <th>Total Dividends</th>
                <th>Payments</th>
                <th>Frequency</th>
                <th>Yield %</th>
                <th>Date Range</th>
              </tr>
            </thead>
            <tbody>
              {topFunds.map((fund) => {
                const frequency = summary.frequencies[fund.fund];
                const yieldPercent = summary.yields[fund.fund];

                return (
                  <tr key={fund.fund}>
                    <td><strong>{fund.fund}</strong></td>
                    <td>{formatCurrency(fund.totalAmount)}</td>
                    <td>{fund.count}</td>
                    <td>
                      {frequency && (
                        <span className={`frequency-badge frequency-${frequency.toLowerCase()}`}>
                          {frequency}
                        </span>
                      )}
                      {!frequency && <span className="meta">—</span>}
                    </td>
                    <td>
                      {yieldPercent != null ? `${yieldPercent.toFixed(2)}%` : <span className="meta">—</span>}
                    </td>
                    <td className="meta">
                      {formatDate(fund.firstPayment)} - {formatDate(fund.lastPayment)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dividends by Account - Hidden until multiple accounts pay dividends */}
      {/* <section>
        <div className="section-header">
          <h2>Dividends by Account</h2>
          <p className="section-description">Compare dividend income across accounts</p>
        </div>

        <div className="dividend-table">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Total Dividends</th>
                <th>Payments</th>
                <th>Holdings</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(summary.byAccount)
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .map((account) => (
                  <tr key={account.account}>
                    <td><strong>{account.account}</strong></td>
                    <td>{formatCurrency(account.totalAmount)}</td>
                    <td>{account.count}</td>
                    <td className="meta">{account.funds.join(', ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section> */}

      {/* Recent Dividends */}
      <section>
        <div className="section-header">
          <h2>Recent Dividends</h2>
          <p className="section-description">Latest dividend payments</p>
        </div>

        <div className="dividend-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fund</th>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredDividends]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 20)
                .map((dividend, index) => (
                  <tr key={index}>
                    <td>{formatDate(dividend.date)}</td>
                    <td><strong>{dividend.fund}</strong></td>
                    <td className="meta">{formatAccountName(dividend.account)}</td>
                    <td>{formatCurrency(dividend.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
