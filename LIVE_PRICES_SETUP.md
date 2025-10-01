# Live ETF Prices - Setup Guide

## ✅ Implementation Complete

All code has been written and is ready to deploy. Follow these steps to activate live price tracking.

---

## Step 1: Run Database Migration

**Action:** Open [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) and run this SQL:

```bash
# Navigate to your Supabase project SQL Editor and execute:
cat supabase/migrations/add_etf_prices_table.sql
```

Or copy/paste the contents of `supabase/migrations/add_etf_prices_table.sql` into the Supabase SQL Editor.

**Expected Result:** Table `current_etf_prices` created with 4 rows (VTI, SCHD, QQQM, DES)

---

## Step 2: Verify Cloudflare Environment Variable

**Already Done! ✅**
- `FINNHUB_API_KEY` = `d3e9du9r01qrd38teio0d3e9du9r01qrd38teiog`
- Configured in Cloudflare Pages Settings → Environment Variables

---

## Step 3: Deploy to Cloudflare Pages

**Action:** Commit and push changes to GitHub

```bash
git add .
git commit -m "Add live ETF price tracking for Roth IRA holdings"
git push origin main
```

Cloudflare Pages will automatically deploy the new functions:
- `/api/prices/refresh` - Fetch from Finnhub and update database
- `/api/prices/latest` - Return cached prices to frontend

---

## Step 4: Test Price Refresh Manually

**Action:** Trigger the GitHub Action manually to populate initial prices

1. Go to: https://github.com/YOUR_USERNAME/401K-Tracker/actions
2. Click "Sync ETF Prices" workflow
3. Click "Run workflow" → "Run workflow"
4. Wait ~10 seconds for completion
5. Check logs for "✅ Price sync completed successfully"

**Alternative:** Call the API directly via curl:

```bash
curl -X POST https://401k.mreedon.com/api/prices/refresh \
  -H "X-401K-Token: YOUR_API_SHARED_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Prices updated successfully",
  "marketOpen": true,
  "updated": [
    {"ticker": "VTI", "price": 245.32, "changePercent": 0.88},
    {"ticker": "SCHD", "price": 28.45, "changePercent": 1.23},
    {"ticker": "QQQM", "price": 198.76, "changePercent": -0.45},
    {"ticker": "DES", "price": 65.43, "changePercent": 0.12}
  ]
}
```

---

## Step 5: Verify Database Updated

**Action:** Check Supabase table

1. Go to Supabase Dashboard → Table Editor
2. Open `current_etf_prices` table
3. Verify all 4 tickers have `price > 0` and recent `updated_at` timestamp

---

## Step 6: Test Frontend Display

**Action:** Visit your dashboard

1. Open https://401k.mreedon.com
2. Check browser console for logs:
   - `💰 Fetching live ETF prices...`
   - `✅ Live prices loaded: VTI, SCHD, QQQM, DES`
   - `📈 Using live price for VTI: $245.32`
3. Verify Roth IRA holdings show updated market values

---

## How It Works

### Data Flow:
1. **GitHub Action** runs every 15 min during market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)
2. **Calls** `/api/prices/refresh` endpoint
3. **Fetches** live prices from Finnhub API for VTI, SCHD, QQQM, DES
4. **Updates** `current_etf_prices` table in Supabase
5. **Frontend** loads prices on page load via `/api/prices/latest`
6. **Merges** live prices into portfolio calculation in `aggregatePortfolio()`

### Fallback Behavior:
- If live prices unavailable → uses latest transaction price
- If API fails → gracefully degrades, no errors shown to user
- If market closed → GitHub Action skips API call, logs "Market is closed"

### Price Sources:
- **Roth IRA ETFs** (VTI, SCHD, QQQM, DES) → Live prices from Finnhub
- **Voya 401(k)** (VFIAX) → Transaction prices only (proprietary fund)
- **Other holdings** → Transaction prices

---

## Files Created/Modified

### New Files:
- ✅ `supabase/migrations/add_etf_prices_table.sql`
- ✅ `functions/api/prices/refresh.js`
- ✅ `functions/api/prices/latest.js`
- ✅ `.github/workflows/price-sync.yml`

### Modified Files:
- ✅ `src/services/HoldingsService.js` - Added `getLatestPrices()`
- ✅ `src/utils/parseTransactions.js` - Updated `aggregatePortfolio()` to accept live prices
- ✅ `src/App.jsx` - Fetch prices before portfolio calculation

---

## Monitoring & Debugging

### Check GitHub Action Logs:
- https://github.com/YOUR_USERNAME/401K-Tracker/actions/workflows/price-sync.yml

### Check Cloudflare Worker Logs:
- https://dash.cloudflare.com → Workers & Pages → Your Site → Logs

### Browser Console Logs:
- Open DevTools → Console
- Look for `📈 Using live price for...` messages

### API Health Check:
```bash
# Get current cached prices
curl https://401k.mreedon.com/api/prices/latest \
  -H "X-401K-Token: YOUR_TOKEN"
```

---

## Troubleshooting

### Problem: Prices not updating
- Check GitHub Action ran successfully
- Verify Finnhub API key is valid: https://finnhub.io/dashboard
- Check market is open (Mon-Fri, 9:30 AM - 4:00 PM ET)

### Problem: Frontend shows transaction prices
- Check browser console for live price logs
- Verify `/api/prices/latest` returns data
- Check Supabase table has recent `updated_at` timestamps

### Problem: GitHub Action fails
- Check `API_SHARED_TOKEN` secret exists in GitHub repo settings
- Verify token matches Cloudflare environment variable
- Check API endpoint is accessible: https://401k.mreedon.com/api/prices/refresh

---

## Next Steps (Optional Enhancements)

- Add "Last updated" timestamp to dashboard UI
- Show visual indicator for live vs transaction prices
- Add manual "Refresh Prices" button (currently auto-refresh only)
- Store historical prices for price charts per fund
- Add VFIAX support (requires different API or scraping)

---

## Success Checklist

- [ ] SQL migration executed in Supabase
- [ ] Code deployed to Cloudflare Pages
- [ ] GitHub Action triggered manually and succeeded
- [ ] `current_etf_prices` table populated with live data
- [ ] Frontend console shows "Using live price" logs
- [ ] Roth IRA holdings display updated market values

Once all items are checked, live price tracking is fully operational! 🎉
