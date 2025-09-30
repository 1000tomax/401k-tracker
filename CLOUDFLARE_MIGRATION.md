# Cloudflare Pages Migration Guide

## What Was Changed

### 1. API Endpoints Converted to Cloudflare Workers
All 9 API endpoints have been migrated from Vercel serverless functions to Cloudflare Workers format:

**Plaid Endpoints:**
- `functions/api/plaid/create_link_token.js` - Create Plaid Link tokens
- `functions/api/plaid/exchange_public_token.js` - Exchange public tokens for access tokens
- `functions/api/plaid/accounts.js` - Get account information
- `functions/api/plaid/investment_transactions.js` - Get investment transactions
- `functions/api/plaid/removeItem.js` - Remove Plaid items
- `functions/api/plaid/webhook.js` - Handle Plaid webhooks
- `functions/api/plaid/billing_items.js` - Get billing information

**Database Endpoints:**
- `functions/api/db/transactions.js` - Transaction CRUD operations
- `functions/api/db/plaid.js` - Plaid connection management

### 2. New Files Created
- `src/utils/cors-workers.js` - CORS utilities for Cloudflare Workers
- `wrangler.toml` - Cloudflare Pages configuration

### 3. Updated Files
- `lib/plaidConfig.js` - Now supports both process.env and Workers env
- `src/lib/supabaseAdmin.js` - Now supports both process.env and Workers env

## Deployment Steps

### Step 1: Create Cloudflare Account
1. Go to https://dash.cloudflare.com/sign-up
2. Sign up or log in

### Step 2: Connect GitHub Repository
1. Go to **Workers & Pages** in Cloudflare dashboard
2. Click **Create Application** → **Pages** → **Connect to Git**
3. Authorize Cloudflare to access your GitHub account
4. Select the `401K-Tracker` repository
5. Configure build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`

### Step 3: Add Environment Variables
In Cloudflare Pages settings → **Environment variables**, add:

**Required:**
- `PLAID_CLIENT_ID` - Your Plaid client ID
- `PLAID_SECRET` - Your Plaid secret
- `PLAID_ENV` - `sandbox` or `production`
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key
- `API_SHARED_TOKEN` - Your API authentication token

**Optional:**
- `PLAID_PRODUCTS` - Comma-separated list (default: `auth,transactions,investments`)
- `PLAID_COUNTRY_CODES` - Comma-separated list (default: `US`)
- `CORS_ORIGIN` - Allowed CORS origin
- `NODE_ENV` - `production` or `development`

### Step 4: Deploy
1. Click **Save and Deploy**
2. Cloudflare will build and deploy your site
3. Your app will be available at `https://401k-tracker.pages.dev` (or custom domain)

### Step 5: Update Plaid Webhook URL (if using production)
1. Go to Plaid Dashboard
2. Update webhook URL to: `https://your-domain.pages.dev/api/plaid/webhook`

## Key Differences from Vercel

### Handler Format
**Before (Vercel):**
```javascript
export default async function handler(req, res) {
  return res.status(200).json({ data });
}
```

**After (Cloudflare):**
```javascript
export async function onRequestPost(context) {
  const { request, env } = context;
  return jsonResponse({ data }, 200, env);
}
```

### Environment Variables
- **Vercel:** `process.env.VAR_NAME`
- **Cloudflare:** `env.VAR_NAME` (passed to functions)

### CORS Handling
- **Vercel:** Custom middleware with `res.setHeader()`
- **Cloudflare:** `Response` objects with headers

## Testing Locally

### Option 1: Use Vite Dev Server (Development)
```bash
npm run dev
```
Note: This will use the old `/api` endpoints (not Workers). Good for frontend dev.

### Option 2: Use Wrangler (Workers Testing)
```bash
npm install -g wrangler
wrangler pages dev dist --compatibility-date=2024-01-01
```

## Rollback Plan

If you need to rollback, the old Vercel endpoints are still in the `/api` directory. You can:
1. Keep deploying to Vercel
2. Delete the `/functions` directory
3. Continue using Vercel as before

## Benefits of Cloudflare Pages

✅ **Unlimited bandwidth** (vs Vercel's 100GB free tier)
✅ **No function invocation limits** (vs Netlify's 125k/month)
✅ **Edge deployment** - Fast globally
✅ **Generous free tier** - No surprise bills
✅ **Workers are mature** - Stable platform

## Troubleshooting

### Issue: Functions not working
- Check environment variables are set in Cloudflare dashboard
- Check build logs for errors
- Verify `/functions` directory structure

### Issue: CORS errors
- Verify `CORS_ORIGIN` environment variable is set correctly
- Check browser console for specific CORS errors

### Issue: Plaid API errors
- Verify Plaid credentials in environment variables
- Check webhook URL is updated in Plaid dashboard
- Verify environment (`sandbox` vs `production`)

## Next Steps

1. Test all endpoints after deployment
2. Update any hardcoded URLs in your frontend
3. Monitor Cloudflare analytics
4. Consider adding custom domain
5. Delete Vercel project once confirmed working