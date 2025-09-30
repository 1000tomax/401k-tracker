-- Holdings Snapshots Table
-- Stores daily snapshots of investment holdings (from Plaid and manual sources like Voya)
-- This table tracks portfolio holdings over time for historical charts and analysis

CREATE TABLE IF NOT EXISTS holdings_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Snapshot metadata
  snapshot_date DATE NOT NULL,
  account_id TEXT NOT NULL, -- plaid account ID or manual identifier (e.g., voya_401k_pretax)
  account_name TEXT NOT NULL,

  -- Holding details
  fund TEXT NOT NULL, -- Ticker symbol (e.g., VFIAX, SPY)
  shares NUMERIC(20, 8) NOT NULL,
  unit_price NUMERIC(20, 8) NOT NULL,
  market_value NUMERIC(20, 2) NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one snapshot per date/account/fund combination
  UNIQUE(snapshot_date, account_id, fund)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_date ON holdings_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_account ON holdings_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_fund ON holdings_snapshots(fund);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_date_account ON holdings_snapshots(snapshot_date, account_id);

-- Updated_at trigger
CREATE TRIGGER update_holdings_snapshots_updated_at BEFORE UPDATE ON holdings_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE holdings_snapshots ENABLE ROW LEVEL SECURITY;

-- Default policy (allow all for service_role, will add user policies later)
CREATE POLICY "Allow service role all access on holdings_snapshots" ON holdings_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE holdings_snapshots IS 'Daily snapshots of investment holdings from Plaid and manual sources';
COMMENT ON COLUMN holdings_snapshots.snapshot_date IS 'Date of the snapshot (date only, no time)';
COMMENT ON COLUMN holdings_snapshots.account_id IS 'Plaid account ID or manual identifier (e.g., voya_401k_pretax)';
COMMENT ON COLUMN holdings_snapshots.account_name IS 'Human-readable account name';
COMMENT ON COLUMN holdings_snapshots.fund IS 'Ticker symbol or fund identifier';
COMMENT ON COLUMN holdings_snapshots.shares IS 'Number of shares held';
COMMENT ON COLUMN holdings_snapshots.unit_price IS 'Price per share at snapshot time';
COMMENT ON COLUMN holdings_snapshots.market_value IS 'Total market value (shares × unit_price)';
