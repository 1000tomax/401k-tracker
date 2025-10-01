-- Create raw_plaid_transactions table
-- Stores ALL transactions from Plaid before any filtering
-- Enables future features: dividend tracking, cash flow analysis, fee reporting

CREATE TABLE IF NOT EXISTS raw_plaid_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plaid identifiers
  plaid_transaction_id TEXT NOT NULL UNIQUE,
  plaid_account_id TEXT NOT NULL,
  plaid_security_id TEXT,

  -- Connection reference
  source_connection_id TEXT NOT NULL, -- plaid_connections.item_id
  institution_name TEXT,
  account_name TEXT,

  -- Transaction details
  date DATE NOT NULL,
  type TEXT NOT NULL, -- buy, sell, dividend, transfer, etc.
  subtype TEXT,

  -- Security info
  security_symbol TEXT,
  security_name TEXT,
  security_cusip TEXT,

  -- Financial details
  quantity NUMERIC(20, 8),
  price NUMERIC(20, 8),
  amount NUMERIC(20, 2),
  fees NUMERIC(20, 2) DEFAULT 0,
  currency_code TEXT DEFAULT 'USD',

  -- Raw Plaid response (for debugging and future flexibility)
  raw_json JSONB,

  -- Metadata
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT raw_plaid_transactions_pkey PRIMARY KEY (id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_raw_plaid_date ON raw_plaid_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_raw_plaid_account ON raw_plaid_transactions(plaid_account_id);
CREATE INDEX IF NOT EXISTS idx_raw_plaid_connection ON raw_plaid_transactions(source_connection_id);
CREATE INDEX IF NOT EXISTS idx_raw_plaid_symbol ON raw_plaid_transactions(security_symbol);
CREATE INDEX IF NOT EXISTS idx_raw_plaid_type ON raw_plaid_transactions(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_plaid_transaction_id ON raw_plaid_transactions(plaid_transaction_id);

-- Add comment
COMMENT ON TABLE raw_plaid_transactions IS 'Raw unfiltered transactions from Plaid API. Append-only for complete audit trail. Enables future features like dividend tracking, cash flow analysis, and fee reporting.';
