-- Create a security lookup table to map CUSIPs to ticker symbols
-- This helps when Plaid returns dividends without security_id but with CUSIP in the name

CREATE TABLE IF NOT EXISTS security_lookup (
  cusip TEXT PRIMARY KEY,
  ticker_symbol TEXT NOT NULL,
  security_name TEXT,
  security_type TEXT DEFAULT 'etf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert known securities from M1 Finance
INSERT INTO security_lookup (cusip, ticker_symbol, security_name, security_type) VALUES
  ('97717W604', 'DES', 'WisdomTree U.S. SmallCap Dividend Fund', 'etf'),
  ('808524797', 'SCHD', 'Schwab US Dividend Equity ETF', 'etf'),
  ('46138E784', 'PCY', 'Invesco Emerging Markets Sovereign Debt ETF', 'etf'),
  ('025072877', 'AVUV', 'Avantis U.S. Small Cap Value ETF', 'etf'),
  ('922042858', 'VWO', 'Vanguard FTSE Emerging Markets ETF', 'etf'),
  ('922908769', 'VTI', 'Vanguard Total Stock Market ETF', 'etf'),
  ('46138G649', 'QQQM', 'Invesco NASDAQ 100 ETF', 'etf')
ON CONFLICT (cusip) DO UPDATE
  SET ticker_symbol = EXCLUDED.ticker_symbol,
      security_name = EXCLUDED.security_name,
      security_type = EXCLUDED.security_type,
      updated_at = NOW();

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_security_lookup_ticker ON security_lookup(ticker_symbol);

COMMENT ON TABLE security_lookup IS 'Maps CUSIPs to ticker symbols for dividend matching when Plaid does not provide security_id';
