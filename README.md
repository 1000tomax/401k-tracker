# 401K Tracker

A modern portfolio tracking application for retirement accounts. Automatically syncs holdings from investment accounts via Plaid and provides daily snapshots of your portfolio value.

## Live Demo

**[https://401k.mreedon.com](https://401k.mreedon.com)**

## Features

- **Plaid Integration** - Securely connect to investment accounts for automatic transaction syncing.
- **Transaction Tracking** - Full transaction history with cost basis calculation
- **Live ETF Prices** - Auto-refresh ETF prices every 15 min during market hours (Finnhub API)
- **Account Growth Chart** - Visualize portfolio value and cost basis over time
- **Gain/Loss Tracking** - Real-time profit/loss calculation per holding and total portfolio
- **Email Notifications** - Daily transaction summaries via Resend API
- **Daily Auto-Sync** - Automatic Plaid sync via GitHub Actions (6 AM UTC)
- **Supabase Database** - Secure cloud storage for transactions and raw data
- **Manual Voya Import** - Copy-paste 401(k) data for tracking
- **Cloudflare Pages** - Fast, global deployment with Workers Functions

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
2. **Daily Cron** (GitHub Actions) triggers `/api/sync/transactions`
3. **Transaction Sync** fetches investment transactions from Plaid
   - Saves ALL transactions to `raw_plaid_transactions` (unfiltered)
   - Filters and saves buy/sell transactions to `transactions`
4. **Price Refresh** (every 15 min during market hours) updates `current_etf_prices`
5. **Portfolio Calculation** aggregates transactions with live prices
6. **Dashboard** displays current holdings with real-time values

### Database Tables
- `plaid_connections` - Plaid access tokens and institution info
- `raw_plaid_transactions` - Complete unfiltered transaction history from Plaid (dividends, transfers, etc.)
- `transactions` - Filtered buy/sell transactions for portfolio tracking
- `current_etf_prices` - Live stock prices (refreshed every 15 min during market hours)
- `email_notifications` - Email delivery audit trail

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

### Claude Code MCP Server Setup

The project includes Supabase MCP server configuration for AI-assisted development. This allows Claude Code to directly query the database when building or debugging features.

**Setup:**
1. Ensure `.mcp.json` exists in project root (already configured)
2. Restart Claude Code to load the MCP server
3. Authenticate with Supabase when prompted (uses OAuth)
4. MCP runs in read-only mode by default for safety

**Features:**
- Query database tables directly during development
- Verify schema without manual inspection
- Debug data issues in real-time
- Generate accurate migrations based on current schema

**Security:** The `.mcp.json` file is gitignored and scoped to this project only.

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
│   │   ├── db/             # Database query endpoints
│   │   ├── emails/         # Email notification system
│   │   ├── plaid/          # Plaid integration (connect, exchange)
│   │   ├── prices/         # Live ETF price endpoints
│   │   └── sync/           # Transaction sync triggers
├── src/
│   ├── components/         # React components
│   ├── contexts/           # React context providers
│   ├── lib/                # Configuration (Plaid, Supabase)
│   ├── pages/              # Page components (Dashboard, Accounts)
│   ├── services/           # API service layers
│   └── utils/              # Utility functions (portfolio calculation, formatters)
├── supabase/migrations/    # Database schema migrations
├── .github/workflows/      # GitHub Actions (daily sync, price refresh)
└── wrangler.toml           # Cloudflare configuration
```

## Future Enhancements

See [FUTURE_FEATURES.md](FUTURE_FEATURES.md) for detailed roadmap.

**Planned:**
- Weekly/monthly/quarterly email recaps with Claude AI commentary
- Individual fund detail views with transaction history
- Dividend tracking using raw transaction data
- Retirement goal tracking and projections
- PWA support for mobile app experience

## License

MIT