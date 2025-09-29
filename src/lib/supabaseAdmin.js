/**
 * Supabase Admin Client for Server-Side (API routes)
 * Uses service_role key with full access (bypasses RLS)
 * NEVER import this in frontend code!
 */
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin credentials in environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default createSupabaseAdmin;