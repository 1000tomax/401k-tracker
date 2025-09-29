-- 401K Tracker Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Plaid Connections Table
-- Stores encrypted Plaid access tokens and connection metadata
CREATE TABLE IF NOT EXISTS plaid_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL, -- Store encrypted on application layer
  institution_id TEXT,
  institution_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- active, expired, error
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts Table
-- Investment accounts linked to Plaid connections
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plaid_account_id TEXT UNIQUE NOT NULL,
  connection_id UUID REFERENCES plaid_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT, -- investment, depository, etc.
  subtype TEXT, -- ira, 401k, brokerage, etc.
  mask TEXT, -- last 4 digits
  balances JSONB DEFAULT '{}', -- current, available, limit
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions Table
-- Investment transactions with deduplication hashing
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core transaction data
  date DATE NOT NULL,
  fund TEXT NOT NULL,
  money_source TEXT,
  activity TEXT NOT NULL, -- Buy, Sell, Dividend, etc.
  units NUMERIC(20, 8),
  unit_price NUMERIC(20, 8),
  amount NUMERIC(20, 2) NOT NULL,

  -- Source tracking
  source_type TEXT NOT NULL, -- 'plaid', 'manual', 'csv'
  source_id TEXT, -- Plaid item_id or manual identifier
  plaid_transaction_id TEXT UNIQUE,
  plaid_account_id TEXT,

  -- Deduplication hashes
  transaction_hash TEXT NOT NULL, -- Primary hash for exact matching
  fuzzy_hash TEXT, -- Fuzzy hash for similar transaction detection
  enhanced_hash TEXT, -- Enhanced hash with units/price
  hash_data JSONB, -- Store hash components for debugging

  -- Metadata
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync History Table
-- Track synchronization operations and errors
CREATE TABLE IF NOT EXISTS sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID REFERENCES plaid_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'auto', 'manual', 'initial'
  status TEXT NOT NULL, -- 'success', 'error', 'partial'

  transactions_fetched INTEGER DEFAULT 0,
  transactions_new INTEGER DEFAULT 0,
  transactions_duplicate INTEGER DEFAULT 0,
  transactions_updated INTEGER DEFAULT 0,

  start_date DATE,
  end_date DATE,

  error_message TEXT,
  error_details JSONB,

  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_fund ON transactions(fund);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_fuzzy_hash ON transactions(fuzzy_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id ON transactions(plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_account ON transactions(plaid_account_id);

CREATE INDEX IF NOT EXISTS idx_accounts_plaid_id ON accounts(plaid_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_connection ON accounts(connection_id);

CREATE INDEX IF NOT EXISTS idx_plaid_connections_item_id ON plaid_connections(item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_connections_status ON plaid_connections(status);

CREATE INDEX IF NOT EXISTS idx_sync_history_connection ON sync_history(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_created ON sync_history(created_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_plaid_connections_updated_at BEFORE UPDATE ON plaid_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Enable for future multi-user support
ALTER TABLE plaid_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- Default policies (allow all for service_role, will add user policies later)
CREATE POLICY "Allow service role all access on plaid_connections" ON plaid_connections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role all access on accounts" ON accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role all access on transactions" ON transactions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role all access on sync_history" ON sync_history
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE plaid_connections IS 'Stores Plaid access tokens and connection metadata';
COMMENT ON TABLE accounts IS 'Investment accounts linked to Plaid connections';
COMMENT ON TABLE transactions IS 'Investment transactions with deduplication support';
COMMENT ON TABLE sync_history IS 'Tracks synchronization operations and errors';