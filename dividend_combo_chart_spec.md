# Dividend Combo Chart (Bars + Running Average Line) - 401k Tracker Spec

> **IMPLEMENTATION TIMELINE: Defer until Q2 2026**
>
> Currently have 5 dividends over 7 days. Need 6-12 months of data for meaningful trend analysis.
> Existing cumulative chart + monthly bars are sufficient for early stage.

## Context

**Project**: 401k Tracker (React + Supabase + Cloudflare Workers)

**Current State** (October 2025):
- 5 dividend payments from Roth IRA via M1 Finance ($1.20 total)
- Funds: DES, SCHD, PCY, AVUV, VWO (mix of monthly + quarterly payers)
- Auto-sync via Plaid daily at 6 AM UTC
- Dividends stored separately from transactions (reinvestments = separate buy records)

## Goal

Enhance the existing Monthly Dividend Income chart (currently bars only) by adding a **running average line** to show trend through quarterly payment noise.

**Why**:
- Monthly bars will vary significantly due to quarterly payers on staggered schedules
- Running average smooths this variation to show if passive income is actually growing
- Motivational feedback: "Am I making more in dividends as my portfolio grows?"

## Current Implementation

### Existing Chart (src/pages/Dividends.jsx ~line 300)

```jsx
{/* Monthly Dividend Income Chart */}
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
```

### Data Source (src/services/DividendService.js ~line 200)

```javascript
aggregateByMonth(dividends) {
  const byMonth = new Map();

  for (const dividend of dividends) {
    const date = new Date(dividend.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, {
        month: monthKey,
        totalAmount: 0,
        count: 0,
        payments: []
      });
    }

    const monthData = byMonth.get(monthKey);
    monthData.totalAmount += parseFloat(dividend.amount) || 0;
    monthData.count += 1;
    monthData.payments.push(dividend);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}
```

## Proposed Enhancement

### Option 1: Running Average of Monthly Totals (RECOMMENDED)

**What it shows**: Average monthly dividend income from inception to current month

**Why this option**:
- ✅ Same scale as bars (both in dollars per month)
- ✅ Shows long-term growth trend clearly
- ✅ Intuitive: "Your average monthly dividend income is growing from $X to $Y"
- ✅ Works even with sparse early data
- ✅ Smooths quarterly payment lumpiness

**Formula**: For each month, calculate `sum of all monthly totals / number of months`

### Updated Service Method

```javascript
aggregateByMonth(dividends) {
  const byMonth = new Map();

  // First pass: aggregate by month
  for (const dividend of dividends) {
    const date = new Date(dividend.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, {
        month: monthKey,
        totalAmount: 0,
        count: 0,
        payments: []
      });
    }

    const monthData = byMonth.get(monthKey);
    monthData.totalAmount += parseFloat(dividend.amount) || 0;
    monthData.count += 1;
    monthData.payments.push(dividend);
  }

  // Second pass: calculate running average
  const sorted = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  let cumulativeTotal = 0;

  return sorted.map((monthData, index) => {
    cumulativeTotal += monthData.totalAmount;
    const runningAvg = cumulativeTotal / (index + 1);

    return {
      month: monthData.month,
      totalAmount: monthData.totalAmount,
      count: monthData.count,
      runningAvgMonthly: runningAvg,
      payments: monthData.payments
    };
  });
}
```

### Updated Component (Dividends.jsx)

```jsx
// Update monthlyData useMemo (~line 106)
const monthlyData = useMemo(() => {
  const byMonth = dividendService.aggregateByMonth(filteredDividends);
  return byMonth.map(m => ({
    month: m.month,
    amount: m.totalAmount,
    count: m.count,
    runningAvg: m.runningAvgMonthly  // New field
  }));
}, [filteredDividends, dividendService]);

// Update chart (~line 300)
import { ComposedChart } from 'recharts'; // Already imported

<ResponsiveContainer width="100%" height={300}>
  <ComposedChart data={monthlyData}>
    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
    <XAxis dataKey="month" stroke="#888" />
    <YAxis stroke="#888" tickFormatter={tickFormatter} />
    <Tooltip content={renderTooltip} />
    <Legend />
    <Bar dataKey="amount" name="Monthly Dividends" fill="#60a5fa" />
    <Line
      type="monotone"
      dataKey="runningAvg"
      name="Monthly Average"
      stroke="#4ade80"
      strokeWidth={2}
      dot={false}
    />
  </ComposedChart>
</ResponsiveContainer>
```

## Database Schema

### Actual `dividends` Table (from supabase/migrations/add_dividends_table.sql)

```sql
CREATE TABLE IF NOT EXISTS dividends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core dividend data
  date DATE NOT NULL,
  fund TEXT NOT NULL,                   -- Ticker symbol (DES, SCHD, etc.)
  account TEXT NOT NULL,                -- Account name (Roth IRA, 401k, etc.)
  amount NUMERIC(20, 2) NOT NULL,       -- Dividend amount in USD

  -- Source tracking
  source_type TEXT NOT NULL,            -- 'plaid', 'manual', 'csv'
  source_id TEXT,                       -- Plaid item_id or manual identifier
  plaid_transaction_id TEXT UNIQUE,     -- Link to raw Plaid transaction
  plaid_account_id TEXT,                -- Plaid account identifier

  -- Enhanced metadata
  security_id TEXT,                     -- CUSIP, ISIN, or other security identifier
  security_type TEXT,                   -- mutual fund, ETF, stock, etc.
  dividend_type TEXT,                   -- qualified, ordinary, capital gains, etc.
  payment_frequency TEXT,               -- monthly, quarterly, annual
  ex_date DATE,                         -- Ex-dividend date (if known)
  record_date DATE,                     -- Record date (if known)

  -- Deduplication
  dividend_hash TEXT NOT NULL,          -- Hash: date+fund+account+amount

  -- Metadata
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_dividends_date ON dividends(date DESC);
CREATE INDEX idx_dividends_fund ON dividends(fund);
CREATE INDEX idx_dividends_account ON dividends(account);
CREATE INDEX idx_dividends_date_fund ON dividends(date DESC, fund);
```

### Supporting Infrastructure

**CUSIP Lookup Table** (for ticker symbol resolution when Plaid returns CUSIP):
```sql
CREATE TABLE security_lookup (
  cusip TEXT PRIMARY KEY,
  ticker_symbol TEXT NOT NULL,
  security_name TEXT,
  security_type TEXT DEFAULT 'etf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Edge Cases & Notes

### M1 Finance Specifics
- **Dividends come with null security_id**: Extract CUSIP from transaction name field
- **Auto-reinvestment**: Dividends received → immediately converted to buy transactions
- **Plaid format**: `type: "cash"`, `subtype: "dividend"`, `quantity: 0`

### Data Aggregation
- **Client-side computation**: All done in JavaScript (DividendService.js)
- **No backend API changes needed**: Data fetched via existing `/api/db/dividends` endpoint
- **Performance**: Handles hundreds of dividends easily in browser
- **Future**: Could move to Cloudflare Worker if needed, but not necessary at current scale

### Missing Months
- **Handling**: Months with $0 dividends won't appear in data (Map doesn't create entries)
- **Display**: Consider filling gaps with $0 bars for visual continuity
- **Line behavior**: Running average continues upward (doesn't drop to zero for gap months)

### Timezone
- **Irrelevant for monthly aggregation**: Monthly bucketing unaffected by timezone
- **Daily cutoffs**: Only matter if adding daily dividend charts (not planned)

## Alternative Options (Not Recommended Initially)

### Option 2: Trailing Moving Average (e.g., 3-month or 12-month)
- **When useful**: Once you have 12+ months of data
- **Formula**: Average of last N months
- **Pro**: Shows recent trend; adapts faster to changes
- **Con**: Meaningless with < N months of data; adds complexity

### Option 3: Running Average Per Payout
- **What**: Average dividend payment size (ignores monthly bucketing)
- **Pro**: Shows if individual dividend payments are growing
- **Con**: Different scale from bars; requires secondary Y-axis; confusing

## Acceptance Criteria

When implemented (Q2 2026):
- ✅ Bars show actual monthly dividend totals
- ✅ Line shows running average of monthly totals
- ✅ Both use same Y-axis (dollars)
- ✅ Chart renders in < 100ms with 12 months of data
- ✅ Tooltip shows both bar value and running average
- ✅ Legend clearly labels "Monthly Dividends" and "Monthly Average"
- ✅ Mobile responsive (single column layout on small screens)

## Implementation Checklist

- [ ] Update `DividendService.aggregateByMonth()` to include running average calculation
- [ ] Update `monthlyData` useMemo in Dividends.jsx to map runningAvg field
- [ ] Change `<BarChart>` to `<ComposedChart>` in component
- [ ] Add `<Line>` component for running average
- [ ] Test with mock data (6-12 months of varied dividend amounts)
- [ ] Verify tooltip shows both values
- [ ] Check mobile responsiveness

## Why Wait Until Q2 2026?

**Current state (Oct 2025)**:
- 5 dividends over 7 days
- All from same account (Roth IRA)
- No quarterly pattern visible yet

**What you need**:
- 6-12 months of dividend history
- Multiple quarterly payment cycles
- Visible month-to-month variation

**What you have now that's sufficient**:
- ✅ **Cumulative Dividend Income chart**: Shows total growth over time (always going up = motivating!)
- ✅ **Monthly Dividend Income bars**: Shows when dividends hit
- ✅ **Top Dividend Funds table**: Shows which positions pay best
- ✅ **Recent Dividends list**: Shows latest 20 payments

**When to revisit**:
- April 2026: You'll have 6 months of data
- October 2026: You'll have 12 months showing full seasonal pattern
- Quarterly spikes will be visible, making the smoothing line valuable

## Future Enhancements (Nice-to-Have)

### Stacked Bars by Fund
Show which funds contributed to each month's total:
```jsx
<Bar dataKey="DES" stackId="a" fill="#8b5cf6" />
<Bar dataKey="SCHD" stackId="a" fill="#6366f1" />
<Bar dataKey="PCY" stackId="a" fill="#3b82f6" />
// ... etc
<Line dataKey="runningAvg" stroke="#4ade80" />
```

### Seasonality Heatmap
Month × Year grid showing which months historically pay most.

### Forward Projection
Based on last observed payment schedule, project next 12 months of dividends.

### 12-Month Moving Average
Add alongside running average once you have 2+ years of data to show recent trend vs all-time trend.

---

## References

- **Current Charts**: src/pages/Dividends.jsx (lines 239-311)
- **Data Service**: src/services/DividendService.js (lines 200-224)
- **Database Schema**: supabase/migrations/add_dividends_table.sql
- **Recharts Docs**: https://recharts.org/en-US/api/ComposedChart

**Last Updated**: October 2025
**Status**: Deferred until Q2 2026 (waiting for sufficient data)
