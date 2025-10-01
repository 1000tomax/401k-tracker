-- Add current_etf_prices table for live price tracking
-- Stores latest prices for Roth IRA ETFs only (VTI, SCHD, QQQM, DES)

CREATE TABLE IF NOT EXISTS current_etf_prices (
  ticker VARCHAR(10) PRIMARY KEY,
  price DECIMAL(10, 4) NOT NULL,
  change_percent DECIMAL(5, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize with 4 Roth IRA tickers
INSERT INTO current_etf_prices (ticker, price, change_percent, updated_at)
VALUES
  ('VTI', 0, 0, NOW()),
  ('SCHD', 0, 0, NOW()),
  ('QQQM', 0, 0, NOW()),
  ('DES', 0, 0, NOW())
ON CONFLICT (ticker) DO NOTHING;

-- Enable RLS for future multi-user support
ALTER TABLE current_etf_prices ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Allow service role all access on current_etf_prices" ON current_etf_prices
  FOR ALL USING (true) WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_etf_prices_updated_at ON current_etf_prices(updated_at DESC);

-- Comment for documentation
COMMENT ON TABLE current_etf_prices IS 'Live ETF prices for Roth IRA holdings (VTI, SCHD, QQQM, DES)';
