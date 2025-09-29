/**
 * List transactions with filtering and pagination
 * GET /api/db/transactions/list
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { allowCorsAndAuth, requireSharedToken } from '../../../src/utils/cors.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Require authentication
  const auth = requireSharedToken(req);
  if (!auth.ok) {
    return send(res, auth.status, { ok: false, error: auth.message });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params = url.searchParams;

    // Pagination
    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '1000');
    const offset = (page - 1) * limit;

    // Filters
    const fund = params.get('fund');
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');
    const sourceType = params.get('source_type');
    const moneySource = params.get('money_source');

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' });

    // Apply filters
    if (fund) query = query.eq('fund', fund);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (sourceType) query = query.eq('source_type', sourceType);
    if (moneySource) query = query.eq('money_source', moneySource);

    // Order and paginate
    query = query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) throw error;

    return send(res, 200, {
      ok: true,
      transactions: transactions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Error listing transactions:', error);
    return send(res, 500, {
      ok: false,
      error: 'Failed to list transactions',
      details: error.message,
    });
  }
}