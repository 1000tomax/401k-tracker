# Quick Start: Database Setup

## 🚀 Get Your Database Running in 5 Minutes

### Step 1: Run the Schema Migration (2 min)

1. Open Supabase: https://ovkdmeiyrnqbzvotwaso.supabase.co
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy EVERYTHING from `supabase/schema.sql`
5. Paste and click **Run**
6. ✅ You should see "Success. No rows returned"

### Step 2: Migrate Your Existing Data (1 min)

Start your dev server:
```bash
npm run dev
```

In another terminal, migrate your data:
```bash
# Dry run first (preview only)
curl -X POST http://localhost:5173/api/db/migrate-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer D9Iqd2dWzlLuSbyk4Jxt7ZPvi6r17J7JRSEjasdvlt7PpjwR4puPzcJJ0GOsMEjt" \
  -d '{"dryRun": true}'

# Actual migration
curl -X POST http://localhost:5173/api/db/migrate-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer D9Iqd2dWzlLuSbyk4Jxt7ZPvi6r17J7JRSEjasdvlt7PpjwR4puPzcJJ0GOsMEjt" \
  -d '{"dryRun": false}'
```

### Step 3: Verify It Works (1 min)

Check your transactions are in the database:
```bash
curl "http://localhost:5173/api/db/transactions/list?limit=10" \
  -H "Authorization: Bearer D9Iqd2dWzlLuSbyk4Jxt7ZPvi6r17J7JRSEjasdvlt7PpjwR4puPzcJJ0GOsMEjt"
```

You should see your transactions in JSON format!

### Step 4: Deploy to Vercel (1 min)

1. Go to your Vercel project settings
2. Add environment variables:
   - `SUPABASE_URL` = `https://ovkdmeiyrnqbzvotwaso.supabase.co`
   - `SUPABASE_ANON_KEY` = (your anon key from .env.local)
   - `SUPABASE_SERVICE_KEY` = (your service key from .env.local)
3. Redeploy your app

### ✅ Done!

Your app now has:
- ✅ Persistent database storage
- ✅ ~1500 transactions migrated
- ✅ Cross-device data sync
- ✅ Server-side Plaid token storage
- ✅ Automatic deduplication
- ✅ Fast indexed queries

## Using the New Database in Your Code

### Old Way (localStorage - don't use anymore)
```javascript
import PlaidStorageService from './services/PlaidStorageService';
```

### New Way (Database - use this!)
```javascript
import PlaidDatabaseService from './services/PlaidDatabaseService';

// Get all connections
const connections = await PlaidDatabaseService.getConnections();

// Get transactions
const data = await PlaidDatabaseService.getTransactions({
  limit: 100,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

// Sync from Plaid
const result = await PlaidDatabaseService.syncTransactions(connectionId);
```

## Next Steps

1. **Test Plaid Flow**: Connect a new account and watch it save to database
2. **View Data**: Check Supabase Table Editor to see your data
3. **Monitor Syncs**: Check `sync_history` table for sync logs
4. **Add Features**: Now you can add analytics, charts, multi-user, etc.

## Troubleshooting

**"No transactions returned"**
- Did Step 2 show `"imported": 1500+`?
- Check Supabase Table Editor → transactions table

**"Connection refused"**
- Is `npm run dev` running?
- Check port is 5173

**"Authentication failed"**
- Verify your auth token in `.env.local` matches the curl command

**"Tables don't exist"**
- Go back to Step 1 and run the schema.sql

## Need Help?

Check [DATABASE_SETUP.md](./DATABASE_SETUP.md) for detailed documentation.