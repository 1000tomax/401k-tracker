-- Portfolio Snapshots Table
-- Stores daily snapshots of portfolio value for accurate historical charting
-- This allows us to track market value changes over time, not just on transaction dates

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Snapshot metadata
  snapshot_date DATE NOT NULL,
  snapshot_time TIMESTAMPTZ DEFAULT NOW(),

  -- Portfolio totals
  total_market_value NUMERIC(20, 2) NOT NULL,
  total_cost_basis NUMERIC(20, 2) NOT NULL,
  total_gain_loss NUMERIC(20, 2) NOT NULL,
  total_gain_loss_percent NUMERIC(8, 4),

  -- Cash flow tracking
  cumulative_contributions NUMERIC(20, 2) DEFAULT 0,
  cumulative_withdrawals NUMERIC(20, 2) DEFAULT 0,

  -- Metadata
  snapshot_source TEXT DEFAULT 'manual', -- 'manual', 'automated', 'backfill'
  market_status TEXT, -- 'open', 'closed', 'pre-market', 'after-hours'
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one snapshot per date
  UNIQUE(snapshot_date)
);

-- Holdings Snapshots Table (detail level)
-- Stores per-holding data for each portfolio snapshot
CREATE TABLE IF NOT EXISTS holdings_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to portfolio snapshot
  snapshot_date DATE NOT NULL REFERENCES portfolio_snapshots(snapshot_date) ON DELETE CASCADE,

  -- Holding identification
  fund TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT, -- For Plaid accounts

  -- Position data
  shares NUMERIC(20, 8) NOT NULL,
  unit_price NUMERIC(20, 8) NOT NULL,
  market_value NUMERIC(20, 2) NOT NULL,
  cost_basis NUMERIC(20, 2) NOT NULL,
  gain_loss NUMERIC(20, 2) NOT NULL,

  -- Price metadata
  price_source TEXT, -- 'live', 'transaction', 'proxy'
  price_timestamp TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_date ON holdings_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_fund ON holdings_snapshots(fund);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_account ON holdings_snapshots(account_name);

-- Row Level Security
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings_snapshots ENABLE ROW LEVEL SECURITY;

-- Default policies (allow all for service_role)
CREATE POLICY "Allow service role all access on portfolio_snapshots" ON portfolio_snapshots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role all access on holdings_snapshots" ON holdings_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE portfolio_snapshots IS 'Daily portfolio value snapshots for accurate historical tracking';
COMMENT ON TABLE holdings_snapshots IS 'Per-holding detail for each portfolio snapshot';
COMMENT ON COLUMN portfolio_snapshots.snapshot_date IS 'Date of the snapshot (one per day)';
COMMENT ON COLUMN portfolio_snapshots.market_status IS 'Market status at time of snapshot';
COMMENT ON COLUMN holdings_snapshots.price_source IS 'Source of price data (live API, transaction NAV, or proxy calculation)';
