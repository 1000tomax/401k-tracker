-- Create dividends table for tracking dividend income separately from transactions
-- Dividends don't affect cost basis (reinvestments show as separate buy transactions)
-- This allows pure visual/analytics tracking of passive income

CREATE TABLE IF NOT EXISTS dividends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core dividend data
  date DATE NOT NULL,
  fund TEXT NOT NULL, -- Ticker symbol or fund name
  account TEXT NOT NULL, -- Account name (Roth IRA, Voya 401k, etc.)
  amount NUMERIC(20, 2) NOT NULL, -- Dividend amount in USD

  -- Source tracking
  source_type TEXT NOT NULL, -- 'plaid', 'manual', 'csv'
  source_id TEXT, -- Plaid item_id or manual identifier
  plaid_transaction_id TEXT UNIQUE, -- Link to raw Plaid transaction
  plaid_account_id TEXT, -- Plaid account identifier

  -- Enhanced metadata
  security_id TEXT, -- CUSIP, ISIN, or other security identifier
  security_type TEXT, -- mutual fund, ETF, stock, etc.
  dividend_type TEXT, -- qualified, ordinary, capital gains, etc.
  payment_frequency TEXT, -- monthly, quarterly, annual
  ex_date DATE, -- Ex-dividend date (if known)
  record_date DATE, -- Record date (if known)

  -- Deduplication
  dividend_hash TEXT NOT NULL, -- Hash for deduplication: date+fund+account+amount

  -- Metadata
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(date DESC);
CREATE INDEX IF NOT EXISTS idx_dividends_fund ON dividends(fund);
CREATE INDEX IF NOT EXISTS idx_dividends_account ON dividends(account);
CREATE INDEX IF NOT EXISTS idx_dividends_source ON dividends(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_dividends_hash ON dividends(dividend_hash);
CREATE INDEX IF NOT EXISTS idx_dividends_plaid_id ON dividends(plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_dividends_plaid_account ON dividends(plaid_account_id);

-- Composite index for common queries (date range + fund/account)
CREATE INDEX IF NOT EXISTS idx_dividends_date_fund ON dividends(date DESC, fund);
CREATE INDEX IF NOT EXISTS idx_dividends_date_account ON dividends(date DESC, account);

-- Enable RLS
ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

-- Default policy (allow all for service_role)
CREATE POLICY "Allow service role all access on dividends" ON dividends
  FOR ALL USING (true) WITH CHECK (true);

-- Add comment
COMMENT ON TABLE dividends IS 'Dividend income tracking. Separate from transactions to avoid affecting cost basis. Enables passive income analytics and dividend growth visualization.';
