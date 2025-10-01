# Future Features & Improvements

This document tracks ideas and planned features for the 401K Tracker.

## Portfolio Change Indicators

**Status:** ✅ Implemented - shown in dashboard chart and gain/loss columns

**Description:**
Show simple growth/decline indicators throughout the app to give users a sense of progress:
- ✅ Total portfolio gain/loss with percentage (shown in header)
- ✅ Per-holding gain/loss indicators (shown in holdings table)
- ✅ Visual color coding (green/red)
- ✅ Historical chart showing cost basis vs market value over time

**Completed Features:**
- Portfolio header shows: Cost Basis, Market Value, and Total Gain/Loss
- Holdings table shows per-position gain/loss with percentage
- Account Growth chart displays both cost basis and market value lines
- Color-coded gain/loss columns (green for positive, red for negative)

**Data Source:**
- ✅ Transaction-based portfolio calculation
- ✅ Real-time cost basis tracking
- ✅ Timeline data with historical values

---

## Fund Detail View (Clickable ETFs)

**Status:** Planned - waiting for more historical transaction data

**Description:**
Add clickable fund/ETF names in holdings tables that open a detailed view showing:
- Historical price chart for the fund
- Your transaction history for that specific fund
- Cost basis and performance (% gain/loss)
- Share accumulation over time
- Key metrics (current price, your total shares, market value)

**Implementation Notes:**
- Query `transactions` table by fund ticker
- Create `FundDetail` component with Recharts price chart
- Add route `/fund/:ticker` or use modal overlay
- Reuse existing chart styling and components
- Show buy/sell transactions on timeline

**Data Available:**
- ✅ Historical transaction data in `transactions` table
- ✅ Transaction dates, prices, and quantities
- ✅ Cost basis tracking per fund

---

## Live Stock Price Integration

**Status:** ✅ Implemented - auto-refreshes every 15 minutes during market hours

**Description:**
Real-time stock price API integration showing current market values for Roth IRA ETFs instead of relying on latest transaction prices.

**Target Funds:**
- ✅ VTI (Vanguard Total Stock Market ETF)
- ✅ SCHD (Schwab U.S. Dividend Equity ETF)
- ✅ QQQM (Invesco NASDAQ 100 ETF)
- ✅ DES (WisdomTree U.S. SmallCap Dividend Fund)

**Completed Implementation:**
- ✅ Finnhub API integration (60 calls/min free tier)
- ✅ Auto-refresh every 15 minutes during market hours via GitHub Actions
- ✅ Market hours detection (Mon-Fri, 9:30 AM - 4:00 PM ET)
- ✅ Database caching in `current_etf_prices` table
- ✅ Graceful fallback to transaction prices if API unavailable
- ✅ Price source tracking ('live' vs 'transaction')

**Technical Details:**
- API endpoints: `/api/prices/refresh`, `/api/prices/latest`
- GitHub Action: `.github/workflows/price-sync.yml`
- Frontend integration: `aggregatePortfolio()` merges live prices
- Voya 401(k) still uses transaction prices (proprietary fund)

---

## Other Ideas

### Portfolio Analytics
- Total contributions vs gains
- Asset allocation pie chart
- Tax-advantaged vs taxable breakdown
- Projected retirement value calculator

### Enhanced Voya Integration
- Screenshot upload + OCR parsing (eliminate manual copy-paste)
- CSV transaction import if Voya adds export feature
- Multi-fund support if user diversifies holdings
- Automated reminder to update balance monthly

### Transaction Tracking
- Import transactions from Plaid
- Manual transaction entry
- Calculate cost basis and realized gains
- Track dividends and reinvestments

### Performance Metrics
- YTD, 1Y, 5Y, all-time returns
- Compare to benchmark (S&P 500)
- Risk metrics (volatility, Sharpe ratio)
- Goal tracking (retirement target date)

### Mobile Improvements
- Progressive Web App (PWA) support
- Mobile-optimized charts
- Fingerprint/Face ID for quick access
- Push notifications for portfolio milestones

### Data Export
- Export portfolio data to CSV/Excel
- Generate PDF reports
- Tax documents helper (capital gains summary)

---

**Note:** These are ideas and may or may not be implemented. Priority will be based on usefulness and data availability.
