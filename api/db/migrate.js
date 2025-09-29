/**
 * Run database schema migration
 * POST /api/db/migrate
 *
 * NOTE: This is a simplified migration endpoint.
 * For production, run the SQL directly in Supabase SQL Editor:
 * See /supabase/schema.sql
 */
import { createSupabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Require authentication
  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    const supabase = createSupabaseAdmin();

    // Check if tables exist by querying them
    const checks = await Promise.allSettled([
      supabase.from('plaid_connections').select('count', { count: 'exact', head: true }),
      supabase.from('accounts').select('count', { count: 'exact', head: true }),
      supabase.from('transactions').select('count', { count: 'exact', head: true }),
      supabase.from('sync_history').select('count', { count: 'exact', head: true }),
    ]);

    const tableStatus = {
      plaid_connections: checks[0].status === 'fulfilled',
      accounts: checks[1].status === 'fulfilled',
      transactions: checks[2].status === 'fulfilled',
      sync_history: checks[3].status === 'fulfilled',
    };

    const allTablesExist = Object.values(tableStatus).every(exists => exists);

    if (allTablesExist) {
      // Get counts
      const counts = await Promise.all([
        supabase.from('plaid_connections').select('count', { count: 'exact', head: true }),
        supabase.from('accounts').select('count', { count: 'exact', head: true }),
        supabase.from('transactions').select('count', { count: 'exact', head: true }),
        supabase.from('sync_history').select('count', { count: 'exact', head: true }),
      ]);

      return send(res, 200, {
        ok: true,
        message: 'Database schema already exists',
        tables: tableStatus,
        counts: {
          plaid_connections: counts[0].count,
          accounts: counts[1].count,
          transactions: counts[2].count,
          sync_history: counts[3].count,
        },
      });
    }

    return send(res, 200, {
      ok: true,
      message: 'Please run the schema migration manually in Supabase SQL Editor',
      instructions: [
        '1. Go to your Supabase dashboard',
        '2. Navigate to SQL Editor',
        '3. Open /supabase/schema.sql from this project',
        '4. Copy and paste the SQL into the editor',
        '5. Click "Run" to execute the migration',
      ],
      tables: tableStatus,
      missingTables: Object.entries(tableStatus)
        .filter(([_, exists]) => !exists)
        .map(([table]) => table),
    });
  } catch (error) {
    console.error('Error checking migration status:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to check migration status',
      details: error.message,
    });
  }
}