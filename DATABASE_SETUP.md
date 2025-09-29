# Database Setup Guide

This guide will help you set up Supabase as the database for the 401K Tracker application.

## Prerequisites

- A Supabase account (free tier works!)
- Vercel account with your project deployed
- Supabase credentials already added to `.env.local`

## Step 1: Run Database Schema Migration

### Option A: Using Supabase SQL Editor (Recommended)

1. Go to your Supabase project dashboard: https://ovkdmeiyrnqbzvotwaso.supabase.co
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file `/supabase/schema.sql` from this project
5. Copy the entire SQL content
6. Paste it into the SQL Editor
7. Click **Run** to execute the migration

### Option B: Using the API Endpoint (Check Status Only)

```bash
curl -X POST http://localhost:5173/api/db/migrate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Note: This endpoint only checks if tables exist. Use Option A to actually create the tables.

## Step 2: Verify Tables Were Created

Go to **Table Editor** in Supabase and verify you see these tables:
- `plaid_connections`
- `accounts`
- `transactions`
- `sync_history`

## Step 3: Migrate Existing Transaction Data

Once the schema is in place, migrate your existing transaction data from `data/401k-data.json`:

### Dry Run (Preview Only)
```bash
curl -X POST http://localhost:5173/api/db/migrate-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"dryRun": true}'
```

### Actual Migration
```bash
curl -X POST http://localhost:5173/api/db/migrate-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"dryRun": false}'
```

Expected output:
```json
{
  "ok": true,
  "message": "Data migration completed",
  "results": {
    "total": 1500,
    "imported": 1500,
    "duplicates": 0,
    "updated": 0,
    "errors": 0
  }
}
```

## Step 4: Configure Vercel Environment Variables

Add these environment variables to your Vercel project:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   ```
   SUPABASE_URL=https://ovkdmeiyrnqbzvotwaso.supabase.co
   SUPABASE_ANON_KEY=<your_anon_key>
   SUPABASE_SERVICE_KEY=<your_service_key>
   ```
3. Make sure to set them for **Production**, **Preview**, and **Development** environments
4. Redeploy your application

## Step 5: Test the Integration

### Test Connection Retrieval
```bash
curl http://localhost:5173/api/db/plaid/get-connections \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Transaction Query
```bash
curl "http://localhost:5173/api/db/transactions/list?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Database Schema Overview

### Tables

**plaid_connections**
- Stores Plaid access tokens and connection metadata
- One row per connected financial institution

**accounts**
- Investment accounts linked to Plaid connections
- Stores account names, types, and balances

**transactions**
- All investment transactions with deduplication support
- Indexed by date, fund, and hashes for fast lookups

**sync_history**
- Tracks all synchronization operations
- Records success/failure, duration, and error details

## API Endpoints Reference

### Plaid Connections
- `POST /api/db/plaid/save-connection` - Save a new Plaid connection
- `GET /api/db/plaid/get-connections` - Get all active connections

### Transactions
- `GET /api/db/transactions/list` - Query transactions with filters
- `POST /api/db/transactions/import` - Import transactions with deduplication
- `POST /api/db/transactions/sync` - Sync from Plaid and import

### Migration
- `POST /api/db/migrate` - Check migration status
- `POST /api/db/migrate-data` - Migrate existing JSON data

## Usage in Frontend

### Old Way (localStorage)
```javascript
import PlaidStorageService from './services/PlaidStorageService';
const connection = await PlaidStorageService.loadConnection(password);
```

### New Way (Database)
```javascript
import PlaidDatabaseService from './services/PlaidDatabaseService';
const connections = await PlaidDatabaseService.getConnections();
const transactions = await PlaidDatabaseService.getTransactions({ limit: 100 });
```

## Deduplication Strategy

Transactions are deduplicated using three hash levels:

1. **Primary Hash** (transaction_hash)
   - `date|amount|fund|activity`
   - Exact match detection

2. **Fuzzy Hash** (fuzzy_hash)
   - `date|amount|fund`
   - Similar transaction detection

3. **Enhanced Hash** (enhanced_hash)
   - `date|amount|fund|units|price`
   - High-precision matching

## Troubleshooting

### "Missing Supabase credentials"
- Verify `.env.local` has all three Supabase variables
- Restart your dev server after adding env vars

### "Failed to fetch connections"
- Check Supabase project is active
- Verify service_role key is correct
- Check API endpoint logs in Vercel

### "Schema migration failed"
- Run the SQL directly in Supabase SQL Editor
- Check for syntax errors in the output
- Ensure you have admin access to the project

### Transactions not appearing
- Verify migration completed successfully
- Check for errors in `sync_history` table
- Look at browser console for API errors

## Benefits of Database Migration

✅ **Persistent Storage** - Data saved across devices and browsers
✅ **Server-Side Security** - Plaid tokens stored on server, not in browser
✅ **Fast Queries** - Indexed database queries vs JSON parsing
✅ **Deduplication** - Automatic duplicate detection at database level
✅ **Sync History** - Track all imports and errors
✅ **Scalability** - Ready for multi-user support
✅ **Backup** - Automated by Supabase

## Next Steps

After completing setup:
1. Test Plaid connection flow in the app
2. Verify transactions appear correctly
3. Test sync functionality
4. Remove old localStorage code once validated
5. Consider adding authentication (Supabase Auth)

## Support

If you encounter issues:
1. Check Supabase project logs
2. Check Vercel function logs
3. Check browser console for errors
4. Review the API endpoint responses