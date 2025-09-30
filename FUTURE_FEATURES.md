# Future Features & Improvements

This document tracks ideas and planned features for the 401K Tracker.

## Fund Detail View (Clickable ETFs)

**Status:** Planned - waiting for more historical data

**Description:**
Add clickable fund/ETF names in holdings tables that open a detailed view showing:
- Historical price chart for the fund
- Your holdings over time (share accumulation)
- Cost basis and performance (% gain/loss)
- Transaction history for that specific fund
- Key metrics (current price, your total shares, market value)

**Implementation Notes:**
- Query `holdings_snapshots` table by fund ticker
- Create `FundDetail` component with Recharts price chart
- Add route `/fund/:ticker` or use modal overlay
- Reuse existing chart styling and components
- Wait until 2-3 weeks of data accumulated for meaningful charts

**Data Available:**
- ✅ Historical unit prices in `holdings_snapshots.unit_price`
- ✅ Share quantities over time in `holdings_snapshots.shares`
- ✅ Market values in `holdings_snapshots.market_value`

**Example Query:**
```sql
SELECT snapshot_date, unit_price, shares, market_value
FROM holdings_snapshots
WHERE fund = 'VFIAX'
ORDER BY snapshot_date ASC;
```

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
