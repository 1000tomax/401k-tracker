# Portfolio Snapshots

The 401K Tracker now includes a daily portfolio snapshot system that captures your portfolio value every day, providing accurate historical tracking that reflects market movements, not just transaction dates.

## Overview

### Problem
Previously, the portfolio graph only showed data points on transaction dates. This meant:
- Between transactions, the graph showed a flat line
- Daily market fluctuations weren't visible
- Historical performance tracking was inaccurate

### Solution
Daily snapshots capture:
- **Portfolio totals**: Market value, cost basis, gain/loss
- **Per-holding details**: Shares, prices, values for each fund/account
- **Market context**: Whether captured during market hours, after-hours, etc.

## Database Schema

### `portfolio_snapshots` Table
Stores daily portfolio-level data:
- `snapshot_date` - Date of snapshot (one per day)
- `total_market_value` - Total portfolio value
- `total_cost_basis` - Total amount invested
- `total_gain_loss` - Unrealized gains/losses
- `cumulative_contributions` - Total contributions to date
- `snapshot_source` - How it was created (automated, manual, backfill)
- `market_status` - Market state (open, closed, pre-market, after-hours)

### `holdings_snapshots` Table
Stores per-holding detail for each snapshot:
- Links to `portfolio_snapshots` via `snapshot_date`
- Stores fund, account, shares, unit price, market value
- Tracks price source (live API, transaction, proxy)

## API Endpoints

### `POST /api/snapshots/save`
Creates a snapshot for a specific date (defaults to today)

**Request Body:**
```json
{
  "date": "2025-10-28",  // Optional, defaults to today
  "source": "manual"      // Optional: automated, manual, github-actions
}
```

**Response:**
```json
{
  "ok": true,
  "snapshot": {
    "date": "2025-10-28",
    "marketValue": 150000.00,
    "costBasis": 120000.00,
    "gainLoss": 30000.00,
    "gainLossPercent": 25.00,
    "holdingsCount": 12,
    "marketStatus": "closed"
  }
}
```

### `POST /api/snapshots/backfill`
Generates historical snapshots by replaying transactions

**Request Body:**
```json
{
  "startDate": "2024-01-01",  // Optional, defaults to first transaction
  "endDate": "2025-10-28"      // Optional, defaults to today
}
```

**Response:**
```json
{
  "ok": true,
  "created": 298,
  "errors": 0,
  "skipped": 2,
  "total": 300
}
```

### `GET /api/holdings/snapshots?days=90`
Retrieves snapshots for the last N days

**Response:**
```json
{
  "ok": true,
  "currentHoldings": [...],
  "timeline": [
    {
      "date": "2025-10-28",
      "marketValue": 150000.00,
      "costBasis": 120000.00,
      "gainLoss": 30000.00
    },
    ...
  ],
  "totals": {
    "marketValue": 150000.00,
    "costBasis": 120000.00,
    "gainLoss": 30000.00,
    "totalHoldings": 12,
    "lastUpdated": "2025-10-28"
  }
}
```

## Automation

### GitHub Actions Workflow
The system automatically creates daily snapshots via GitHub Actions:

**File:** `.github/workflows/daily-snapshot.yml`

**Schedule:** Runs Monday-Friday at 4:15 PM ET (after market close)

**Manual Trigger:** Can be run manually via GitHub Actions UI with optional date parameter

### Future: Cloudflare Cron
You can also set up Cloudflare Cron Triggers for more reliable scheduling:

```toml
# wrangler.toml
[[triggers.crons]]
cron = "15 20 * * 1-5"  # 4:15 PM ET, Mon-Fri
```

## Usage

### Initial Setup

1. **Apply the migration** (already done):
   ```sql
   -- Run in Supabase SQL Editor
   -- File: supabase/migrations/add_portfolio_snapshots_table.sql
   ```

2. **Backfill historical data**:
   ```bash
   curl -X POST https://401k.mreedon.com/api/snapshots/backfill \
     -H "X-401K-Token: YOUR_TOKEN" \
     -H "Content-Type: application/json"
   ```

   This will create snapshots for every day from your first transaction to today.

3. **Enable automation**:
   The GitHub Actions workflow is already set up and will run automatically.

### Manual Snapshot Creation

```bash
# Create snapshot for today
curl -X POST https://401k.mreedon.com/api/snapshots/save \
  -H "X-401K-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Create snapshot for a specific date
curl -X POST https://401k.mreedon.com/api/snapshots/save \
  -H "X-401K-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-10-15", "source": "manual"}'
```

### Frontend Integration

The Dashboard automatically checks for snapshot data and uses it if available:

1. Tries to fetch snapshots from `/api/holdings/snapshots`
2. If snapshots exist, uses them for the timeline graph (daily data points)
3. Falls back to transaction-based timeline if no snapshots available
4. Maintains backward compatibility with existing installations

## Benefits

### Accurate Historical Tracking
- Daily portfolio values reflect actual market movements
- See how your portfolio performed between contributions
- Better understanding of market impact vs. contribution impact

### Performance Metrics
With daily data, you can calculate:
- True time-weighted returns (TWR)
- Accurate daily/monthly/yearly gains
- Sharpe ratio and other risk metrics
- Correlation with market benchmarks

### Smooth Charts
- Timeline graph shows daily progression
- No more flat lines between transactions
- Visual representation matches your actual experience

## Technical Details

### Price Sources
Snapshots use the best available price data:

1. **Live API prices** (during/after market hours)
   - Fetched from Finnhub API
   - Updated every 15 minutes during market hours
   - Used for ETFs: VTI, SCHD, QQQM, DES, VOO

2. **Proxy pricing** (for non-traded funds)
   - Voya 0899 fund uses VOO with 15.577 conversion ratio
   - 99.8% historical accuracy

3. **Transaction NAV** (fallback)
   - Last known NAV from transaction data
   - Used when live prices unavailable

### Backfill Strategy
The backfill process:
1. Replays all transactions chronologically
2. Maintains running position for each fund/account
3. Calculates daily portfolio value using last known NAV
4. Tracks cumulative cash flows
5. Skips dates where snapshots already exist

### Data Integrity
- One snapshot per date (enforced by unique constraint)
- Tracks snapshot source (automated, manual, backfill)
- Stores metadata about holdings count, price sources
- Immutable once created (no updates, only new snapshots)

## Monitoring

### Check Snapshot Coverage
```sql
-- Find date gaps in snapshots
SELECT
  snapshot_date,
  LAG(snapshot_date) OVER (ORDER BY snapshot_date) as prev_date,
  snapshot_date - LAG(snapshot_date) OVER (ORDER BY snapshot_date) as gap_days
FROM portfolio_snapshots
WHERE (snapshot_date - LAG(snapshot_date) OVER (ORDER BY snapshot_date)) > 1
ORDER BY snapshot_date DESC;
```

### View Recent Snapshots
```sql
-- Last 7 days of snapshots
SELECT
  snapshot_date,
  total_market_value,
  total_gain_loss,
  total_gain_loss_percent,
  snapshot_source,
  market_status
FROM portfolio_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY snapshot_date DESC;
```

## Troubleshooting

### Snapshot Creation Fails
- Check that all transactions have valid dates
- Ensure live prices API is accessible
- Verify API token is valid

### Missing Historical Data
- Run backfill endpoint to generate historical snapshots
- Check for transaction data gaps
- Review error logs in API responses

### Timeline Not Using Snapshots
- Verify snapshots exist: `GET /api/holdings/snapshots?days=7`
- Check browser console for errors
- Ensure API token is configured correctly

## Future Enhancements

- [ ] Add intraday snapshots (multiple per day)
- [ ] Calculate benchmark comparisons (S&P 500, etc.)
- [ ] Generate performance reports (monthly/quarterly)
- [ ] Add snapshot diff comparison
- [ ] Implement snapshot rollback/correction
- [ ] Export historical data to CSV
