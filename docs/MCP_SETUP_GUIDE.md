# 401k Portfolio Manager - MCP Server Setup Guide

**Manage your 401k portfolio directly in Claude Code or Claude Chat!**

This guide shows you how to set up the custom MCP (Model Context Protocol) server for managing your 401k portfolio: import transactions, analyze holdings, and query portfolio data.

---

## What You'll Get

✅ Import transactions by pasting data directly in Claude (supports Voya and other formats)
✅ Analyze portfolio holdings and performance
✅ Query transaction history and balances
✅ Works on desktop (Claude Code) and mobile (Claude Chat)
✅ Automatic duplicate detection
✅ Instant portfolio updates

---

## Prerequisites

- Cloudflare account (free tier works!)
- Wrangler CLI installed
- Your Supabase credentials

---

## Setup Steps

### Step 1: Install Dependencies

The MCP server needs the Supabase client library:

```bash
cd functions/mcp
npm install @supabase/supabase-js
```

### Step 2: Generate Auth Token

Generate a secure random token for protecting your MCP endpoint:

```bash
# On Mac/Linux:
openssl rand -hex 32

# On Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Save this token** - you'll need it for both Cloudflare and Claude Chat configuration.

### Step 3: Configure Cloudflare Worker Secrets

Set your secrets using Wrangler CLI:

```bash
# Navigate to project root
cd /path/to/401K-Tracker

# Set MCP auth token (paste the token you generated)
wrangler secret put MCP_AUTH_TOKEN

# Set Supabase URL
wrangler secret put SUPABASE_URL
# Enter: https://your-project.supabase.co

# Set Supabase anon key
wrangler secret put SUPABASE_ANON_KEY
# Enter: your_supabase_anon_key

# Set 401k API token (your existing token)
wrangler secret put VITE_401K_TOKEN
# Enter: your_existing_401k_token
```

### Step 4: Update wrangler.toml

Add the MCP worker route to your `wrangler.toml`:

```toml
# ... existing configuration ...

[[workers]]
name = "401k-mcp-portfolio-manager"
main = "functions/mcp/portfolio-manager.js"
compatibility_date = "2024-01-01"

[[workers.routes]]
pattern = "401k.mreedon.com/mcp/*"
zone_name = "mreedon.com"
```

### Step 5: Deploy to Cloudflare

```bash
wrangler deploy
```

You should see output like:
```
✨ Successfully deployed 401k-mcp-portfolio-manager
   https://401k.mreedon.com/mcp/portfolio-manager
```

### Step 6: Configure Claude Chat

1. Open Claude Chat (web or mobile app)
2. Go to Settings → MCP Servers
3. Click "Add Server"
4. Enter:
   - **Name**: `portfolio-manager`
   - **URL**: `https://401k.mreedon.com/mcp/portfolio-manager`
   - **Headers**:
     ```json
     {
       "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN_HERE"
     }
     ```
5. Save

### Step 7: Test It!

**In Claude Code or Claude Chat, type:**

```
/import-voya
```

Then paste your Voya transaction data:

```
Date	Activity	Fund	Money Source	# of Units/Shares	Unit/Share Price	Amount
10/21/2025	Contribution	0899 Vanguard 500 Index Fund Adm	ROTH	2.115	$39.611	$83.78
10/21/2025	Contribution	0899 Vanguard 500 Index Fund Adm	Safe Harbor Match	1.692	$39.611	$67.02
```

Claude should parse it and ask for confirmation before importing!

---

## Usage

### Desktop (Claude Code)

1. Copy transaction data from Voya
2. Type `/import-voya` in Claude Code
3. Paste the data
4. Confirm import

### Mobile (Claude Chat)

1. Copy transaction data from Voya (on desktop or mobile browser)
2. Open Claude Chat mobile app
3. Type `/import-voya`
4. Paste the data
5. Confirm import

---

## How to Get Voya Data

1. Log in to [my.voya.com](https://my.voya.com)
2. Navigate to your 401k account
3. Go to **Transaction History**
4. Select and copy the table with **all columns**:
   - Date
   - Activity
   - Fund
   - Money Source
   - # of Units/Shares
   - Unit/Share Price
   - Amount
5. Paste into Claude

---

## Troubleshooting

### "Unauthorized" Error

- Check that your `Authorization` header in Claude Chat matches the `MCP_AUTH_TOKEN` you set in Cloudflare
- Make sure you included `Bearer ` before the token

### "No transactions found"

- Make sure you copied **all columns** from Voya
- Check that the data is tab-separated (it should be if you copied from the website)
- Try copying the header row along with the data

### "Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL"

- Make sure `SUPABASE_URL` is set to the **full URL** format: `https://your-project-id.supabase.co`
- Common mistake: Setting it to just the project ID (`ovkdmeiyrnqbzvotwaso`) instead of the full URL
- Fix: `echo "https://your-project-id.supabase.co" | wrangler secret put SUPABASE_URL`

### "Database error"

- Check that your Supabase credentials are correct
- Make sure the `transactions` table exists in your database
- Check Supabase logs for more details

### MCP server not responding

- Check that the worker deployed successfully: `wrangler tail`
- Verify the URL in Claude Chat matches your deployment
- Try accessing `https://401k.mreedon.com/mcp/portfolio-manager` in a browser (should return a JSON-RPC error, which is fine)

---

## Security Notes

### Auth Token
- Keep your `MCP_AUTH_TOKEN` secret
- Don't commit it to git
- Rotate it if you think it's been compromised

### Supabase Credentials
- Stored securely in Cloudflare Worker environment
- Never exposed to the client
- Only accessible by the MCP server

### HTTPS
- All communication is encrypted (HTTPS)
- Cloudflare handles SSL automatically

---

## Advanced: Token Rotation

If you need to change your auth token:

```bash
# Generate new token
openssl rand -hex 32

# Update Cloudflare secret
wrangler secret put MCP_AUTH_TOKEN
# Enter new token

# Redeploy
wrangler deploy

# Update Claude Chat config with new token
```

---

## Monitoring

### View Logs

```bash
wrangler tail
```

This shows real-time logs from your MCP server.

### Check Errors

If imports fail, check:
1. Cloudflare Worker logs (`wrangler tail`)
2. Supabase logs (in Supabase dashboard)
3. Claude Code/Chat for error messages

---

## Uninstalling

### Remove from Claude Chat

1. Settings → MCP Servers
2. Find `portfolio-manager`
3. Click Remove

### Remove from Cloudflare

```bash
wrangler delete 401k-mcp-portfolio-manager
```

### Delete Secrets

```bash
wrangler secret delete MCP_AUTH_TOKEN
wrangler secret delete SUPABASE_URL
wrangler secret delete SUPABASE_ANON_KEY
```

---

## Support

If you run into issues:

1. Check the troubleshooting section above
2. Review Cloudflare Worker logs
3. Check Supabase logs
4. Open an issue in the GitHub repo

---

## Interview Talking Points

When discussing this project in interviews:

**Technical Achievement:**
"I built a custom MCP server that integrates with Claude to streamline 401k data imports. The server parses transactions, validates duplicates, and inserts directly to Supabase via a Cloudflare Worker."

**Architecture Decision:**
"I chose MCP over a traditional REST API because it provides better integration with AI assistants. The `/import-voya` command makes the intent explicit while the MCP handles the complexity behind the scenes."

**Security Consideration:**
"I implemented Bearer token authentication and stored credentials in Cloudflare Worker secrets. The token protects the endpoint while keeping the Supabase credentials server-side only."

**Mobile Support:**
"By deploying to Cloudflare Workers instead of running locally, the MCP server is accessible from any device - desktop or mobile - making it practical for bi-weekly transaction imports."

---

**That's it! You're all set up.** 🎉

Now you can import Voya transactions with just a simple `/import-voya` command!
