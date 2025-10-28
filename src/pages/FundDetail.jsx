import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency, formatShares, formatUnitPrice, formatPercent, formatDate } from '../utils/formatters.js';
import TransactionService from '../services/TransactionService.js';
import DividendService from '../services/DividendService.js';
import HoldingsService from '../services/HoldingsService.js';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

// Helper to format account names consistently
const formatAccountName = (name) => {
  if (!name) return '—';
  const lower = name.toLowerCase();

  // Roth IRA
  if (lower.includes('roth') && lower.includes('ira')) {
    return 'Roth IRA';
  }

  // Voya 401(k) sources
  if (lower.includes('pretax') || lower.includes('pre-tax') || lower === 'employee pretax') {
    return 'Voya 401(k) (PreTax)';
  }
  if (lower.includes('match') || lower === 'safe harbor match') {
    return 'Voya 401(k) (Match)';
  }
  if (lower === 'roth' || (lower.includes('roth') && !lower.includes('ira'))) {
    return 'Voya 401(k) (Roth)';
  }

  return name;
};

export default function FundDetail() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [fundSnapshots, setFundSnapshots] = useState(null);

  const transactionService = useMemo(() => new TransactionService(API_URL, API_TOKEN), []);
  const dividendService = useMemo(() => new DividendService(API_URL, API_TOKEN), []);
  const holdingsService = useMemo(() => new HoldingsService(API_URL, API_TOKEN), []);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Fetch fund snapshots first to see if we have historical data
        let snapshotsData = null;
        try {
          const snapshotsUrl = `${API_URL}/api/funds/snapshots?ticker=${encodeURIComponent(ticker.toUpperCase())}&days=365`;
          const snapshotsResponse = await fetch(snapshotsUrl, {
            headers: { 'X-401K-Token': API_TOKEN },
          });
          if (snapshotsResponse.ok) {
            snapshotsData = await snapshotsResponse.json();
            if (snapshotsData.ok && snapshotsData.timeline?.length > 0) {
              setFundSnapshots(snapshotsData);
              console.log(`📊 Loaded ${snapshotsData.timeline.length} fund snapshots`);
            }
          }
        } catch (err) {
          console.log('No fund snapshots available, will use transaction-based calculation');
        }

        // Fetch all other data
        const [txData, divData, priceData] = await Promise.all([
          transactionService.getAllTransactions(),
          dividendService.getAllDividends(),
          holdingsService.getLatestPrices(),
        ]);
        setTransactions(txData);
        setDividends(divData);
        setLivePrices(priceData || {});
      } catch (error) {
        console.error('Failed to load fund data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [ticker, transactionService, dividendService, holdingsService]);

  // Filter transactions for this specific fund
  const fundTransactions = useMemo(() => {
    if (!transactions || !ticker) return [];

    return transactions
      .filter(tx => {
        const fundName = tx.fund?.toUpperCase() || '';
        const tickerUpper = ticker.toUpperCase();

        // Special handling for VOO - also match Voya fund 0899
        if (tickerUpper === 'VOO' && fundName.includes('0899')) {
          return true;
        }

        return fundName === tickerUpper || fundName.includes(tickerUpper);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, ticker]);

  // Filter dividends for this specific fund
  const fundDividends = useMemo(() => {
    if (!dividends || !ticker) return [];

    return dividends
      .filter(div => {
        const fundName = div.fund?.toUpperCase() || '';
        const tickerUpper = ticker.toUpperCase();
        return fundName === tickerUpper || fundName.includes(tickerUpper);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dividends, ticker]);

  // Calculate running totals and metrics
  const fundMetrics = useMemo(() => {
    let timeline = [];
    let totalDividends = 0;

    // Add dividends to total
    fundDividends.forEach(div => {
      totalDividends += parseFloat(div.amount) || 0;
    });

    // If we have fund snapshots, use those for the timeline
    if (fundSnapshots && fundSnapshots.timeline && fundSnapshots.timeline.length > 0) {
      timeline = fundSnapshots.timeline;

      // Use the latest snapshot for current metrics
      const latest = fundSnapshots.latest;
      const currentShares = latest.shares;
      const currentCostBasis = latest.costBasis;
      const avgCost = latest.avgCost;
      const latestPrice = latest.currentPrice;

      // Check if these are Voya transactions (they have fund name with "0899")
      const isVoyaFund = fundTransactions.length > 0 &&
                         fundTransactions[0].fund?.includes('0899');

      // Use live price if available
      const livePriceTicker = isVoyaFund ? 'VOYA_0899' : ticker?.toUpperCase();
      const livePrice = livePrices[livePriceTicker]?.price || latestPrice;
      const marketValue = currentShares * livePrice;
      const gainLoss = marketValue - currentCostBasis;
      const gainLossPercent = currentCostBasis > 0 ? (gainLoss / currentCostBasis) * 100 : 0;

      return {
        ticker: ticker.toUpperCase(),
        currentShares,
        currentCostBasis,
        avgCost,
        latestPrice,
        livePrice,
        marketValue,
        gainLoss,
        gainLossPercent,
        totalDividends,
        timeline,
        transactionCount: fundTransactions.length,
        dividendCount: fundDividends.length,
        firstBuyDate: fundTransactions[0]?.date,
        lastTransactionDate: fundTransactions[fundTransactions.length - 1]?.date,
        usingSnapshots: true,
      };
    }

    // Fallback: Build timeline from transactions if no snapshots available
    let totalShares = 0;
    let totalCostBasis = 0;

    fundTransactions.forEach(tx => {
      const shares = parseFloat(tx.units) || 0;
      const price = parseFloat(tx.unit_price) || 0;
      const amount = parseFloat(tx.amount) || Math.abs(shares * price);
      const activity = (tx.activity || '').toLowerCase();

      const isBuy = activity.includes('buy') ||
                    activity.includes('purchase') ||
                    activity.includes('contribution') ||
                    activity.includes('transfer in');
      const isSell = activity.includes('sell') ||
                     activity.includes('sold') ||
                     activity.includes('transfer out') ||
                     activity.includes('fee');

      if (isBuy) {
        totalShares += shares;
        totalCostBasis += amount;
      } else if (isSell) {
        totalShares -= shares;
        const sellRatio = shares / (totalShares + shares);
        totalCostBasis -= totalCostBasis * sellRatio;
      }

      timeline.push({
        date: tx.date,
        shares: totalShares,
        costBasis: totalCostBasis,
        avgCost: totalShares > 0 ? totalCostBasis / totalShares : 0,
        price: price,
        marketValue: totalShares * price,
        activity: activity,
      });
    });

    const currentShares = totalShares;
    const currentCostBasis = totalCostBasis;
    const avgCost = currentShares > 0 ? currentCostBasis / currentShares : 0;
    const latestEntry = timeline[timeline.length - 1];
    const latestPrice = latestEntry?.price || fundTransactions[fundTransactions.length - 1]?.unit_price || 0;

    const isVoyaFund = fundTransactions.length > 0 &&
                       fundTransactions[0].fund?.includes('0899');
    const livePriceTicker = isVoyaFund ? 'VOYA_0899' : ticker?.toUpperCase();
    const livePrice = livePrices[livePriceTicker]?.price || latestPrice;
    const marketValue = currentShares * livePrice;
    const gainLoss = marketValue - currentCostBasis;
    const gainLossPercent = currentCostBasis > 0 ? (gainLoss / currentCostBasis) * 100 : 0;

    return {
      ticker: ticker.toUpperCase(),
      currentShares,
      currentCostBasis,
      avgCost,
      latestPrice,
      livePrice,
      marketValue,
      gainLoss,
      gainLossPercent,
      totalDividends,
      timeline,
      transactionCount: fundTransactions.length,
      dividendCount: fundDividends.length,
      firstBuyDate: fundTransactions[0]?.date,
      lastTransactionDate: fundTransactions[fundTransactions.length - 1]?.date,
      usingSnapshots: false,
    };
  }, [fundTransactions, fundDividends, ticker, livePrices, fundSnapshots]);


  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading fund details...</div>
      </div>
    );
  }

  if (!fundTransactions.length) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <h2>No Data Found</h2>
          <p>No transactions found for ticker: {ticker?.toUpperCase()}</p>
          <button onClick={() => navigate('/')} className="button">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const tickFormatter = value => {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{formatDate(label)}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {
              entry.dataKey === 'shares'
                ? formatShares(entry.value)
                : formatCurrency(entry.value)
            }
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <button onClick={() => navigate(-1)} className="back-button">
            ← Back
          </button>
          <h1>{fundMetrics.ticker}</h1>
          {livePrices[fundMetrics.ticker] && (
            <p className="fund-name">{livePrices[fundMetrics.ticker].name || 'ETF/Fund'}</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Current Shares</div>
          <div className="summary-value">{formatShares(fundMetrics.currentShares)}</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Cost Basis</div>
          <div className="summary-value">{formatCurrency(fundMetrics.currentCostBasis)}</div>
          <div className="summary-meta">Avg: {formatUnitPrice(fundMetrics.avgCost)}</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Current Price</div>
          <div className="summary-value">{formatUnitPrice(fundMetrics.livePrice)}</div>
          {livePrices[fundMetrics.ticker]?.change !== undefined && (
            <div className={`summary-meta ${livePrices[fundMetrics.ticker].change >= 0 ? 'positive' : 'negative'}`}>
              {livePrices[fundMetrics.ticker].changePercent}
            </div>
          )}
        </div>

        <div className="summary-card">
          <div className="summary-label">Market Value</div>
          <div className="summary-value">{formatCurrency(fundMetrics.marketValue)}</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Gain / Loss</div>
          <div className={`summary-value ${fundMetrics.gainLoss >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(fundMetrics.gainLoss)}
          </div>
          <div className={`summary-meta ${fundMetrics.gainLoss >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(fundMetrics.gainLossPercent / 100)}
          </div>
        </div>

        {fundMetrics.totalDividends > 0 && (
          <div className="summary-card">
            <div className="summary-label">Total Dividends</div>
            <div className="summary-value positive">{formatCurrency(fundMetrics.totalDividends)}</div>
            <div className="summary-meta">{fundMetrics.dividendCount} payments</div>
          </div>
        )}
      </div>

      {/* Value Growth Chart */}
      <div className="chart-section">
        <h2>Value Growth Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={fundMetrics.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#888"
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
            />
            <YAxis
              stroke="#888"
              tickFormatter={tickFormatter}
              label={{ value: 'Value ($)', angle: -90, position: 'insideLeft', fill: '#888' }}
            />
            <Tooltip content={renderTooltip} />
            <Legend />
            <Area
              type="monotone"
              dataKey="costBasis"
              fill="#8b5cf6"
              fillOpacity={0.3}
              stroke="#8b5cf6"
              strokeWidth={2}
              name="Cost Basis"
            />
            <Line
              type="monotone"
              dataKey="marketValue"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Market Value"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Price History Chart */}
      <div className="chart-section">
        <h2>Price History</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={fundMetrics.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#888"
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
            />
            <YAxis
              stroke="#888"
              tickFormatter={tickFormatter}
              domain={[
                (dataMin) => (dataMin * 0.95).toFixed(2),
                (dataMax) => (dataMax * 1.05).toFixed(2)
              ]}
              scale="linear"
            />
            <Tooltip content={renderTooltip} />
            <Legend />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Transaction Price"
            />
            <Line
              type="monotone"
              dataKey="avgCost"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Avg Cost Basis"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction History */}
      <div className="section">
        <h2>Transaction History ({fundMetrics.transactionCount})</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {fundTransactions.slice().reverse().map((tx, index) => {
                const activity = (tx.activity || '').toLowerCase();
                const isBuy = activity.includes('buy') ||
                              activity.includes('purchase') ||
                              activity.includes('contribution') ||
                              activity.includes('transfer in');
                const isSell = activity.includes('sell') ||
                               activity.includes('sold') ||
                               activity.includes('transfer out') ||
                               activity.includes('fee');
                return (
                  <tr key={index}>
                    <td>{formatDate(tx.date)}</td>
                    <td>
                      <span className={`badge ${isBuy ? 'badge-buy' : 'badge-sell'}`}>
                        {tx.activity?.toUpperCase()}
                      </span>
                    </td>
                    <td>{formatShares(tx.units)}</td>
                    <td>{formatUnitPrice(tx.unit_price)}</td>
                    <td>{formatCurrency(tx.amount || Math.abs((tx.units || 0) * (tx.unit_price || 0)))}</td>
                    <td className="account-name">{formatAccountName(tx.money_source)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dividend History */}
      {fundMetrics.dividendCount > 0 && (
        <div className="section">
          <h2>Dividend History ({fundMetrics.dividendCount})</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {fundDividends.slice().reverse().map((div, index) => (
                  <tr key={index}>
                    <td>{formatDate(div.date)}</td>
                    <td className="positive">{formatCurrency(div.amount)}</td>
                    <td className="account-name">{formatAccountName(div.account)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total Dividends</strong></td>
                  <td className="positive"><strong>{formatCurrency(fundMetrics.totalDividends)}</strong></td>
                  <td>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
