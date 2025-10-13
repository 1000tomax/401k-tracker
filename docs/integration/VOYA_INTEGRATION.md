# Voya Integration Guide

This guide explains how to import your Voya 401(k) account data into the tracker.

## Overview

The Voya integration allows you to track your 401(k) balance over time by manually importing data via copy-paste. Since Voya doesn't provide a public API, this simple approach lets you update your balance whenever you check your account.

## How It Works

### 1. Log into Voya
Visit [my.voya.com](https://my.voya.com) and log into your account.

### 2. Navigate to Balances Page
Go to your account balances page where you can see:
- **Fund Balances**: Your holdings with share count and prices
- **Source Balances**: Breakdown by contribution type (PreTax, Roth, Match)

### 3. Copy Data
Select and copy **both sections**:
- Fund Balances (fund name, ticker, shares, unit price, total value)
- Source Balances (Employee PreTax, ROTH, Safe Harbor Match amounts)

Example of what to copy:
```
Fund and % of My Balance	Unit/Share Price	# of Units/Shares

Fund Balances

0899 Vanguard 500 Index Fund Adm: 100%
$ 39.17	184.44	$7,224.90

Source
Source Balance

Vested Balances
Employee PreTax
$ 4,161.19	$ 4,161.19
ROTH
$ 74.14	$ 74.14
Safe Harbor Match
$ 2,989.57	$ 2,989.57
Total:$ 7,224.90$ 7,224.90
```

### 4. Import into 401K Tracker
1. Open your 401K Tracker app
2. Navigate to the **Accounts** page
3. Scroll to the **Voya 401(k)** section
4. Paste the copied data into the text area
5. Click **"Parse & Preview"** to verify the data was parsed correctly
6. Click **"Save Snapshot"** to save to the database

## Data Storage

Your Voya data is parsed into individual transactions and stored in the main `transactions` table alongside your other investment data. Each row you paste from the Voya website becomes a distinct transaction record in the database.

The `moneySource` for each transaction (e.g., "Employee PreTax", "ROTH", "Safe Harbor Match") is preserved, allowing for granular tracking and analysis of your different contribution types.

## Files

### Frontend
- `src/components/VoyaPasteImport.jsx` - UI component for copy-paste import
- `src/components/VoyaPasteImport.css` - Styling
- `src/services/VoyaParser.js` - Parses pasted text using regex
- `src/services/VoyaDatabaseService.js` - API calls to save to database
- `src/services/VoyaStorageService.js` - localStorage backup/cache

### Backend
The Voya import feature uses the main database API endpoint (`/api/db/transactions`) to save data. There is no longer a dedicated backend function for Voya imports.

## Update Frequency

Update your Voya balance as often as you'd like:
- **Weekly/Monthly** - Good for long-term tracking
- **After contributions** - Track when you add money
- **Market events** - See how your 401(k) responds

The import process takes about 15 seconds.

## Troubleshooting

### Parser Errors
- **"No valid data found"** - Make sure you copied both Fund Balances AND Source Balances sections
- **"Invalid balance"** - Check that dollar amounts are visible in the copied text
- **"Failed to parse"** - Try copying the data again, ensuring all text is selected

### Save Errors
- **"Failed to save snapshot to database"** - Check your internet connection and try again
- **"Missing snapshot data"** - The parser may have failed; try re-parsing the data
- **403/401 errors** - Check that your `VITE_401K_TOKEN` is configured correctly

### Missing Data
- **No holdings showing** - Data saves to today's date; check that you're viewing the correct date range
- **Balance doesn't match** - Verify that all three sources (PreTax, Roth, Match) were parsed correctly

## Security Notes

- ✅ **No API keys needed** - Simple copy-paste, no authentication to store
- ✅ **No session tokens** - No risk of session expiration or security issues
- ✅ **Client-side parsing** - Data is parsed in your browser before sending to database
- ✅ **Database storage** - Same secure Supabase database as your Plaid data
- ✅ **localStorage backup** - Data also cached locally for quick access

## Future Enhancements

Potential improvements:
- Screenshot upload + OCR parsing
- CSV export from Voya (if they add this feature)
- Historical transaction import
- Multi-fund support (if you diversify holdings)
- Automated reminders to update balance

## Support

This is a personal finance tracker. For questions or issues:
- Check the browser console for detailed error logs
- Verify you're copying both Fund Balances AND Source Balances
- Ensure you're logged into Voya before copying data
