/**
 * Refresh ETF Prices from Finnhub
 * Fetches current prices for Roth IRA ETFs and updates database
 * Only runs during market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

const ROTH_IRA_TICKERS = ['VTI', 'SCHD', 'QQQM', 'DES'];

/**
 * Check if US stock market is currently open
 * Market hours: Mon-Fri, 9:30 AM - 4:00 PM ET (13:30 - 20:00 UTC)
 */
function isMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }

  // Convert to minutes since midnight UTC for easier comparison
  const currentMinutes = hour * 60 + minute;
  const marketOpen = 13 * 60 + 30; // 13:30 UTC (9:30 AM ET)
  const marketClose = 20 * 60; // 20:00 UTC (4:00 PM ET)

  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

/**
 * Fetch current price for a single ticker from Finnhub
 */
async function fetchTickerPrice(ticker, apiKey) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();

    // Finnhub returns:
    // c = current price
    // d = change
    // dp = percent change
    // If c is 0, the API call failed or ticker is invalid
    if (!data.c || data.c === 0) {
      throw new Error(`Invalid price data for ${ticker}`);
    }

    return {
      ticker,
      price: data.c,
      changePercent: data.dp || 0,
    };
  } catch (error) {
    console.error(`Failed to fetch ${ticker}:`, error.message);
    throw error;
  }
}

/**
 * Main handler
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const auth = requireSharedToken(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.message }, auth.status, env);
  }

  try {
    // Check if market is open
    if (!isMarketOpen()) {
      console.log('📴 Market is closed, skipping price refresh');
      return jsonResponse({
        ok: true,
        message: 'Market is closed',
        skipped: true,
        marketOpen: false,
      }, 200, env);
    }

    console.log('📈 Market is open, fetching prices...');

    // Get Finnhub API key
    const apiKey = env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    // Fetch all ticker prices in parallel
    const pricePromises = ROTH_IRA_TICKERS.map(ticker =>
      fetchTickerPrice(ticker, apiKey)
    );

    const prices = await Promise.all(pricePromises);

    console.log('✅ Fetched prices:', prices);

    // Update database
    const supabase = createSupabaseAdmin(env);

    const updates = [];
    for (const { ticker, price, changePercent } of prices) {
      const { error } = await supabase
        .from('current_etf_prices')
        .upsert({
          ticker,
          price,
          change_percent: changePercent,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'ticker',
        });

      if (error) {
        console.error(`Failed to update ${ticker}:`, error);
        throw error;
      }

      updates.push({ ticker, price, changePercent });
    }

    console.log('💾 Database updated successfully');

    return jsonResponse({
      ok: true,
      message: 'Prices updated successfully',
      marketOpen: true,
      updated: updates,
      timestamp: new Date().toISOString(),
    }, 200, env);

  } catch (error) {
    console.error('❌ Error refreshing prices:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to refresh prices',
      details: error.message,
    }, 500, env);
  }
}
