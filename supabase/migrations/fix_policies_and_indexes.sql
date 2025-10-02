-- Fix 1: Remove duplicate permissive policies on security_lookup
-- The issue: both "service role all access" and "authenticated read access" policies
-- apply to authenticated users, causing performance overhead
-- Solution: Make service role policy specific to service_role only

-- Drop the overly broad service role policy
DROP POLICY IF EXISTS "Allow service role all access on security_lookup" ON public.security_lookup;

-- Create a more specific service role policy that only applies to service_role
-- Note: In Supabase, service_role bypasses RLS anyway, but this makes intent clear
CREATE POLICY "Service role full access on security_lookup"
ON public.security_lookup
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- The authenticated read policy remains and handles regular users
-- No change needed to: "Allow authenticated read access on security_lookup"


-- Fix 2: Remove duplicate index on raw_plaid_transactions
-- The UNIQUE constraint already creates an index (raw_plaid_transactions_plaid_transaction_id_key)
-- So we can drop the manually created duplicate index

DROP INDEX IF EXISTS public.idx_raw_plaid_transaction_id;

-- Note: The UNIQUE constraint's index (raw_plaid_transactions_plaid_transaction_id_key)
-- will remain and serve the same purpose


-- Update comments
COMMENT ON POLICY "Service role full access on security_lookup" ON security_lookup
IS 'Service role has full access for data management operations';
