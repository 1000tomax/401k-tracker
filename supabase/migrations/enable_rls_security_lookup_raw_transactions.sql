-- Enable RLS on security_lookup and raw_plaid_transactions tables
-- Matches the existing RLS pattern used in the main schema

-- Enable RLS on security_lookup table
ALTER TABLE public.security_lookup ENABLE ROW LEVEL SECURITY;

-- Enable RLS on raw_plaid_transactions table
ALTER TABLE public.raw_plaid_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies matching the existing pattern (service role full access)
-- security_lookup: Reference data table - readable by all, writable by service role
CREATE POLICY "Allow service role all access on security_lookup"
ON public.security_lookup
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated read access on security_lookup"
ON public.security_lookup
FOR SELECT
TO authenticated
USING (true);

-- raw_plaid_transactions: User data table - service role full access
CREATE POLICY "Allow service role all access on raw_plaid_transactions"
ON public.raw_plaid_transactions
FOR ALL
USING (true)
WITH CHECK (true);

-- Comments
COMMENT ON POLICY "Allow service role all access on security_lookup" ON security_lookup
IS 'Service role has full access for data management';

COMMENT ON POLICY "Allow authenticated read access on security_lookup" ON security_lookup
IS 'Authenticated users can read CUSIP/ticker mappings';

COMMENT ON POLICY "Allow service role all access on raw_plaid_transactions" ON raw_plaid_transactions
IS 'Service role has full access for transaction sync operations';
