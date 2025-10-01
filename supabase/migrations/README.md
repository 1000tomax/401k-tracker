# Database Migrations

## How to Apply Migrations

These SQL migration files need to be run manually in the Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of the migration file
5. Paste and **Run** the query

## Migrations

### `add_raw_plaid_transactions_table.sql`
**Purpose:** Creates a table to store ALL raw Plaid transactions before filtering.

**Why:** Currently, when we sync from Plaid, we filter out dividends, cash transfers, and other non-buy/sell transactions. This data is permanently lost. By storing all raw transactions, we enable future features:
- Dividend tracking and reinvestment analysis
- Cash flow analysis (deposits, withdrawals)
- Fee tracking and reporting
- Complete audit trail
- Ability to retroactively change filtering logic

**Impact:**
- Storage: Minimal (few KB per day, append-only)
- Performance: No impact on existing queries
- Data: Preserves complete Plaid transaction history

**Tables affected:**
- Creates new table: `raw_plaid_transactions`
- No changes to existing tables

### `add_email_notifications_table.sql`
**Purpose:** Creates tables for email notification system.
