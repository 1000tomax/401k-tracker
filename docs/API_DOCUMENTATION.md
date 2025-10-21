# API Documentation

This document describes all API endpoints available in the 401K Tracker application. All endpoints are implemented as Cloudflare Workers Functions.

## Authentication

Most API endpoints require authentication using a shared token passed in the `X-401K-Token` header:

```bash
X-401K-Token: your_api_token
```

The token must match the `API_SHARED_TOKEN` environment variable configured in Cloudflare Pages.

## Base URL

- **Production**: `https://401k.mreedon.com/api`
- **Local Development**: `http://localhost:5175/api`

---

## Plaid Integration

### Create Link Token

Creates a Plaid Link token for initializing the Plaid Link flow.

**Endpoint**: `POST /api/plaid/create_link_token`

**Authentication**: Required

**Request Body**:
```json
{
  "user_id": "default-user"
}
```

**Response**:
```json
{
  "link_token": "link-sandbox-abc123...",
  "expiration": "2025-01-15T12:00:00Z"
}
```

---

### Exchange Public Token

Exchanges a Plaid public token for an access token after successful Link flow.

**Endpoint**: `POST /api/plaid/exchange_public_token`

**Authentication**: Required

**Request Body**:
```json
{
  "public_token": "public-sandbox-abc123..."
}
```

**Response**:
```json
{
  "access_token": "access-sandbox-xyz789...",
  "item_id": "item_abc123..."
}
```

---

### Get Accounts

Retrieves account information for a given Plaid access token.

**Endpoint**: `POST /api/plaid/accounts`

**Authentication**: Required

**Request Body**:
```json
{
  "access_token": "access-sandbox-xyz789..."
}
```

**Response**:
```json
{
  "accounts": [
    {
      "account_id": "acc_123",
      "name": "Roth IRA",
      "type": "investment",
      "subtype": "ira",
      "balances": {
        "current": 50000.00
      }
    }
  ]
}
```

---

### Get Investment Transactions

Fetches investment transactions for a Plaid-connected account.

**Endpoint**: `POST /api/plaid/investment_transactions`

**Authentication**: Required

**Request Body**:
```json
{
  "access_token": "access-sandbox-xyz789...",
  "start_date": "2024-01-01",
  "end_date": "2025-01-15"
}
```

**Response**:
```json
{
  "investment_transactions": [...],
  "securities": [...],
  "accounts": [...],
  "total_investment_transactions": 42
}
```

---

### Save Plaid Connection

Saves a Plaid connection to the database (called after successful token exchange).

**Endpoint**: `POST /api/plaid/save-connection`

**Authentication**: Required

**Request Body**:
```json
{
  "access_token": "access-sandbox-xyz789...",
  "item_id": "item_abc123...",
  "institution_name": "M1 Finance"
}
```

**Response**:
```json
{
  "ok": true,
  "connection_id": "conn_123"
}
```

---

### Remove Plaid Connection

Removes a Plaid connection from the database.

**Endpoint**: `POST /api/plaid/remove-connection`

**Authentication**: Required

**Request Body**:
```json
{
  "connection_id": "conn_123"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Connection removed"
}
```

---

### Get Plaid Connections

Retrieves all active Plaid connections.

**Endpoint**: `GET /api/plaid/connections`

**Authentication**: Required

**Response**:
```json
{
  "connections": [
    {
      "id": "conn_123",
      "institution_name": "M1 Finance",
      "created_at": "2024-06-01T10:00:00Z",
      "last_synced_at": "2025-01-15T06:00:00Z"
    }
  ]
}
```

---

### Plaid Webhook

Receives webhooks from Plaid for account updates and error notifications.

**Endpoint**: `POST /api/plaid/webhook`

**Authentication**: None (verified via Plaid webhook signature)

**Request Body** (example):
```json
{
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "TRANSACTIONS_REMOVED",
  "item_id": "item_abc123..."
}
```

---

## Transaction Sync

### Sync Transactions

Triggers a full sync of investment transactions from all connected Plaid accounts. This is the primary sync endpoint called by GitHub Actions daily.

**Endpoint**: `POST /api/sync/transactions`

**Authentication**: Required

**Response**:
```json
{
  "ok": true,
  "message": "Transaction sync complete",
  "synced": 15,
  "total_transactions": 90,
  "transactions_imported": 15,
  "transactions_duplicates": 3,
  "dividends_imported": 5,
  "dividends_duplicates": 0,
  "results": [
    {
      "institution": "M1 Finance",
      "total_fetched": 90,
      "raw_saved": 90,
      "transactions_imported": 15,
      "transactions_duplicates": 3,
      "dividends_imported": 5
    }
  ],
  "date_range": {
    "start": "2024-10-15",
    "end": "2025-01-15"
  }
}
```

**Process**:
1. Fetches last 90 days of transactions from Plaid
2. Saves all raw transactions to `raw_plaid_transactions` table
3. Identifies and saves dividends to `dividends` table
4. Filters and saves buy/sell transactions to `transactions` table
5. Updates `last_synced_at` timestamp for each connection

---

## Live Prices

### Refresh Prices

Fetches live ETF prices from Finnhub API and updates the database.

**Endpoint**: `POST /api/prices/refresh`

**Authentication**: Required

**Query Parameters**:
- `symbols` (optional): Comma-separated list of symbols to refresh. If not provided, refreshes all tracked symbols (VTI, SCHD, QQQM, DES, VOO).

**Response**:
```json
{
  "ok": true,
  "updated": 5,
  "prices": {
    "VTI": {
      "symbol": "VTI",
      "price": 285.42,
      "change": 1.23,
      "percent_change": 0.43,
      "timestamp": "2025-01-15T15:30:00Z"
    }
  }
}
```

---

### Get Latest Prices

Retrieves the most recent cached ETF prices from the database.

**Endpoint**: `GET /api/prices/latest`

**Authentication**: Required

**Response**:
```json
{
  "VTI": {
    "symbol": "VTI",
    "price": 285.42,
    "change": 1.23,
    "percent_change": 0.43,
    "timestamp": "2025-01-15T15:30:00Z",
    "is_stale": false
  }
}
```

**Notes**:
- `is_stale` is `true` if the price is older than 30 minutes
- Prices are auto-refreshed every 15 minutes during market hours via GitHub Actions

---

## Database Queries

### Get Transactions

Retrieves all transactions from the database.

**Endpoint**: `GET /api/db/transactions`

**Authentication**: Required

**Query Parameters**:
- `source_type` (optional): Filter by source type (e.g., `plaid`, `voya`)
- `limit` (optional): Maximum number of transactions to return
- `offset` (optional): Number of transactions to skip (for pagination)

**Response**:
```json
{
  "transactions": [
    {
      "id": 123,
      "date": "2025-01-10",
      "fund": "VTI",
      "money_source": "Roth IRA",
      "activity": "Purchased",
      "units": 10.5,
      "unit_price": 280.50,
      "amount": 2945.25,
      "source_type": "plaid",
      "imported_at": "2025-01-11T06:00:00Z"
    }
  ],
  "total": 500
}
```

---

### Get Dividends

Retrieves all dividend transactions from the database.

**Endpoint**: `GET /api/db/dividends`

**Authentication**: Required

**Response**:
```json
{
  "dividends": [
    {
      "id": 456,
      "date": "2025-01-05",
      "fund": "SCHD",
      "account": "Roth IRA",
      "amount": 12.50,
      "dividend_type": "ordinary",
      "source_type": "plaid",
      "imported_at": "2025-01-06T06:00:00Z"
    }
  ]
}
```

---

### Get Plaid Raw Transactions

Retrieves raw, unfiltered transactions from Plaid (includes all transaction types).

**Endpoint**: `GET /api/debug/plaid-raw`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional): Maximum number of transactions to return (default: 100)

**Response**:
```json
{
  "raw_transactions": [
    {
      "plaid_transaction_id": "tx_abc123",
      "date": "2025-01-10",
      "type": "buy",
      "subtype": null,
      "security_symbol": "VTI",
      "quantity": 10.5,
      "price": 280.50,
      "amount": 2945.25,
      "raw_json": {...}
    }
  ]
}
```

---

## Holdings

### Get Holdings Snapshots

Retrieves daily portfolio snapshots (historical portfolio values).

**Endpoint**: `GET /api/holdings/snapshots`

**Authentication**: Required

**Query Parameters**:
- `start_date` (optional): Start date for snapshots (YYYY-MM-DD)
- `end_date` (optional): End date for snapshots (YYYY-MM-DD)

**Response**:
```json
{
  "snapshots": [
    {
      "date": "2025-01-15",
      "total_value": 150000.00,
      "cost_basis": 130000.00,
      "gain_loss": 20000.00,
      "holdings": {...}
    }
  ]
}
```

---

## Email Notifications

### Send Transaction Summary

Sends an email notification with a summary of recent transactions. Automatically triggered after daily sync when new transactions are detected.

**Endpoint**: `POST /api/emails/send-transaction-summary`

**Authentication**: Required

**Request Body**:
```json
{
  "recipient": "user@example.com",
  "transactions": [...],
  "force": false
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Email sent successfully",
  "email_id": "email_123"
}
```

**Notes**:
- Checks `email_notifications` table to prevent duplicate emails
- Set `force: true` to bypass duplicate check
- Email includes portfolio totals, recent transactions, and gain/loss summary

---

### Get Portfolio Summary

Retrieves portfolio analytics for email content generation.

**Endpoint**: `GET /api/emails/analytics/portfolio-summary`

**Authentication**: Required

**Response**:
```json
{
  "total_value": 150000.00,
  "cost_basis": 130000.00,
  "gain_loss": 20000.00,
  "gain_loss_percent": 15.38,
  "ytd_contributions": 10000.00,
  "holdings_count": 8,
  "accounts": [
    {
      "name": "Roth IRA",
      "value": 100000.00,
      "holdings": 4
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "ok": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid API token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## CORS

All API endpoints support CORS with the origin specified in the `CORS_ORIGIN` environment variable. Preflight OPTIONS requests are automatically handled.

---

## Rate Limiting

The application does not implement rate limiting at the API level. However, external API rate limits apply:

- **Plaid API**: Varies by plan (typically 100-1000 requests/minute)
- **Finnhub API**: 60 API calls/minute (free tier)

---

## GitHub Actions Integration

The following endpoints are designed to be called from GitHub Actions:

1. **Transaction Sync** (`/api/sync/transactions`) - Runs daily at 6 AM UTC
2. **Price Refresh** (`/api/prices/refresh`) - Runs every 15 minutes during market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)
3. **Email Notifications** (`/api/emails/send-transaction-summary`) - Triggered after transaction sync when new data is detected

**Example GitHub Actions workflow**:
```yaml
name: Daily Transaction Sync
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC daily
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger transaction sync
        run: |
          curl -X POST https://401k.mreedon.com/api/sync/transactions \
            -H "X-401K-Token: ${{ secrets.API_SHARED_TOKEN }}"
```

---

## Future Endpoints

Planned endpoints that are not yet implemented:

- `POST /api/portfolio/calculate` - Calculate portfolio metrics on-demand
- `POST /api/transactions/manual` - Add manual transactions
- `GET /api/reports/tax-documents` - Generate tax reports
- `POST /api/goals/set` - Set retirement goals and track progress
