/**
 * Get Latest ETF Prices
 * Returns cached prices from database for frontend display
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    const supabase = createSupabaseAdmin(env);

    // Fetch all current prices
    const { data: prices, error } = await supabase
      .from('current_etf_prices')
      .select('ticker, price, change_percent, updated_at')
      .order('ticker', { ascending: true });

    if (error) throw error;

    // Convert array to map for easier lookup: { VTI: { price, changePercent, updatedAt }, ... }
    const priceMap = {};
    for (const row of prices || []) {
      priceMap[row.ticker] = {
        price: parseFloat(row.price),
        changePercent: row.change_percent ? parseFloat(row.change_percent) : 0,
        updatedAt: row.updated_at,
      };
    }

    return jsonResponse({
      ok: true,
      prices: priceMap,
      count: prices?.length || 0,
    }, 200, env);

  } catch (error) {
    console.error('Error fetching latest prices:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to fetch prices',
      details: error.message,
    }, 500, env);
  }
}
