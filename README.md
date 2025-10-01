# 401K Tracker

A modern portfolio tracking application for retirement accounts. Automatically syncs holdings from investment accounts via Plaid and provides daily snapshots of your portfolio value.

## 🔗 Live Demo

**[https://401k.mreedon.com](https://401k.mreedon.com)**

## Features

- 🔗 **Plaid Integration** - Secure connection to investment accounts (M1 Finance, Voya, etc.)
- 📊 **Holdings Tracking** - Real-time view of your current positions
- 💰 **Live ETF Prices** - Auto-refresh Roth IRA prices every 15 min during market hours (Finnhub API)
- 📈 **Account Growth Chart** - Visualize portfolio value over time
- ⏰ **Daily Auto-Sync** - Automatic holdings refresh via GitHub Actions (6 AM UTC)
- 🗄️ **Supabase Database** - Secure cloud storage for holdings snapshots
- ⚡ **Cloudflare Pages** - Fast, global deployment with Workers Functions

## Tech Stack

- **Frontend**: React, Vite, Recharts
- **Backend**: Cloudflare Workers Functions
- **Database**: Supabase (PostgreSQL)
- **APIs**: Plaid API for financial data, Finnhub API for live stock prices
- **Hosting**: Cloudflare Pages
- **Automation**: GitHub Actions

## Architecture

### Data Flow
1. **Plaid Connections** stored in `plaid_connections` table
2. **Daily Cron** (GitHub Actions) triggers `/api/sync/holdings`
3. **Holdings Sync** fetches latest data from Plaid → saves to `holdings_snapshots`
4. **Dashboard** reads from `holdings_snapshots` for display

### Database Tables
- `plaid_connections` - Plaid access tokens and institution info
- `holdings_snapshots` - Daily snapshots of portfolio holdings

## Setup

### Prerequisites
- Node.js 18+
- Supabase account
- Plaid account (production credentials)
- Cloudflare Pages account

### Environment Variables

Required in Cloudflare Pages dashboard:

```bash
# Plaid API
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=production

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# API Authentication
API_SHARED_TOKEN=your_api_token

# CORS
CORS_ORIGIN=https://your-domain.com
```

For local development, create `.env.local` with `VITE_401K_TOKEN` added.

### Local Development

```bash
npm install
npm run dev
```

### Deploy to Cloudflare Pages

1. Connect GitHub repo to Cloudflare Pages
2. Set environment variables in Cloudflare dashboard
3. Deploy automatically on push to `main`

### GitHub Actions Setup

Add to repository secrets:
- `API_SHARED_TOKEN` - For authenticating sync requests

The daily sync workflow runs at 6 AM UTC automatically.

## Project Structure

```
├── functions/              # Cloudflare Workers Functions
│   ├── api/
│   │   ├── holdings/       # Holdings endpoints
│   │   ├── plaid/          # Plaid integration
│   │   └── sync/           # Sync triggers
│   └── scheduled.js        # Cron handler (unused, using GitHub Actions)
├── src/
│   ├── components/         # React components
│   ├── contexts/           # React context providers
│   ├── lib/                # Configuration (Plaid, Supabase)
│   ├── pages/              # Page components (Dashboard, Accounts)
│   ├── services/           # API service layers
│   └── utils/              # Utility functions
├── .github/workflows/      # GitHub Actions (daily sync)
└── wrangler.toml           # Cloudflare configuration
```

## Future Enhancements

- [ ] **Live Stock Prices** - Integrate real-time price API (e.g., Alpha Vantage, Polygon.io) for Roth IRA funds (VTI, SCHD, QQQM, DES)
- [ ] **Price Refresh Button** - Manual trigger to update latest prices
- [ ] **Auto Price Updates** - Scheduled price updates during market hours
- [ ] **Historical Price Charts** - Individual fund performance tracking
- [ ] **Performance Analytics** - ROI, annualized returns, sector allocation

## License

MIT