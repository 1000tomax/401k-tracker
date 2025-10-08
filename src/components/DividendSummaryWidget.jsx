/**
 * @file DividendSummaryWidget.jsx
 * @description A widget that displays a summary of dividend income, including key metrics
 * like year-to-date and trailing twelve-month totals. It fetches dividend data and
 * presents it in a compact, easy-to-read format.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters.js';
import DividendService from '../services/DividendService.js';

const API_URL = window.location.origin;
const API_TOKEN = import.meta.env.VITE_401K_TOKEN || '';

/**
 * The DividendSummaryWidget component.
 * @returns {React.Component|null} Renders the widget, or null if there are no dividends.
 */
export default function DividendSummaryWidget() {
  const [dividends, setDividends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Memoize the DividendService instance to avoid re-creation on every render.
  const dividendService = useMemo(() => new DividendService(API_URL, API_TOKEN), []);

  // Effect hook to load dividend data when the component mounts.
  useEffect(() => {
    const loadDividends = async () => {
      try {
        setIsLoading(true);
        const data = await dividendService.getAllDividends();
        setDividends(data);
      } catch (err) {
        console.error('Failed to load dividends for widget:', err);
        setDividends([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadDividends();
  }, [dividendService]);

  // Memoized calculation of summary statistics to avoid re-computing on every render.
  const summary = useMemo(() => {
    const total = dividends.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const ytd = dividendService.calculateYTD(dividends);
    const ttm = dividendService.calculateTTM(dividends);

    // Simple 3-month trend (compare last 3 months to previous 3 months)
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

    const last3Months = dividends.filter(d => {
      const date = new Date(d.date);
      return date >= threeMonthsAgo;
    }).reduce((sum, d) => sum + parseFloat(d.amount), 0);

    const previous3Months = dividends.filter(d => {
      const date = new Date(d.date);
      return date >= sixMonthsAgo && date < threeMonthsAgo;
    }).reduce((sum, d) => sum + parseFloat(d.amount), 0);

    const trend = previous3Months > 0
      ? ((last3Months - previous3Months) / previous3Months) * 100
      : 0;

    return {
      total,
      ytd,
      ttm,
      count: dividends.length,
      trend,
      isPositiveTrend: trend >= 0
    };
  }, [dividends, dividendService]);

  if (isLoading) {
    return (
      <section className="dividend-summary-widget">
        <div className="section-header">
          <h2>Dividend Income</h2>
        </div>
        <div className="widget-loading">
          <p className="meta">Loading...</p>
        </div>
      </section>
    );
  }

  if (dividends.length === 0) {
    return null; // Don't show widget if no dividends
  }

  return (
    <section className="dividend-summary-widget">
      <div className="section-header">
        <h2>Dividend Income</h2>
        <Link to="/dividends" className="view-all-link">View Details →</Link>
      </div>

      <div className="dividend-stats">
        <div className="dividend-stat">
          <div className="stat-label">Year-to-Date</div>
          <div className="stat-value">{formatCurrency(summary.ytd)}</div>
        </div>

        <div className="dividend-stat">
          <div className="stat-label">Trailing 12 Months</div>
          <div className="stat-value">{formatCurrency(summary.ttm)}</div>
        </div>

        <div className="dividend-stat">
          <div className="stat-label">All-Time Total</div>
          <div className="stat-value">{formatCurrency(summary.total)}</div>
          <div className="stat-meta">{summary.count} payments</div>
        </div>

        {summary.trend !== 0 && (
          <div className="dividend-stat">
            <div className="stat-label">3-Month Trend</div>
            <div className={`stat-value ${summary.isPositiveTrend ? 'positive' : 'negative'}`}>
              {summary.isPositiveTrend ? '+' : ''}{summary.trend.toFixed(1)}%
            </div>
            <div className="stat-meta">vs previous quarter</div>
          </div>
        )}
      </div>
    </section>
  );
}
