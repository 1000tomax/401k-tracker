-- Fix search_path security warning for update_updated_at_column function
-- Setting search_path prevents potential security issues from schema manipulation

-- Drop and recreate the function with a fixed search_path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add comment explaining the security setting
COMMENT ON FUNCTION update_updated_at_column()
IS 'Trigger function to automatically update updated_at timestamp. Uses fixed search_path for security.';
