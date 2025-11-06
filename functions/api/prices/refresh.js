/**
 * @file functions/api/prices/refresh.js
 * @description Cloudflare Worker function to refresh live ETF prices from the Finnhub API.
 * This is intended to be run on a schedule during market hours to keep portfolio values up-to-date.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * A predefined list of ETF tickers for which to fetch live prices.
 * @type {string[]}
 */
const ROTH_IRA_TICKERS = ['VTI', 'SCHD', 'QQQM', 'DES', 'VOO'];
const VOYA_CONVERSION_RATIO = 15.577; // VOO to Voya 0899 conversion ratio (calculated from Oct 2025 data)

/**
 * Determines if a given date is in US Eastern Daylight Time (EDT) or Eastern Standard Time (EST).
 * US DST rules (since 2007):
 * - Starts: Second Sunday in March at 2:00 AM
 * - Ends: First Sunday in November at 2:00 AM
 * @param {Date} date - The date to check
 * @returns {boolean} `true` if EDT (daylight time), `false` if EST (standard time)
 */
function isDaylightSavingTime(date) {
  const year = date.getUTCFullYear();

  // Find second Sunday in March
  const march = new Date(Date.UTC(year, 2, 1)); // March 1
  const marchDay = march.getUTCDay();
  const secondSundayMarch = 8 + (7 - marchDay) % 7; // Second Sunday
  const dstStart = new Date(Date.UTC(year, 2, secondSundayMarch, 7, 0, 0)); // 2 AM EST = 7 AM UTC

  // Find first Sunday in November
  const november = new Date(Date.UTC(year, 10, 1)); // November 1
  const novemberDay = november.getUTCDay();
  const firstSundayNovember = 1 + (7 - novemberDay) % 7; // First Sunday
  const dstEnd = new Date(Date.UTC(year, 10, firstSundayNovember, 6, 0, 0)); // 2 AM EDT = 6 AM UTC

  return date >= dstStart && date < dstEnd;
}

/**
 * Checks if the US stock market is currently open based on UTC time.
 * Market hours are considered to be Monday-Friday, 9:30 AM - 4:00 PM ET.
 * Automatically adjusts for Eastern Daylight Time (EDT) vs Eastern Standard Time (EST).
 * @returns {boolean} `true` if the market is open, `false` otherwise.
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

  // Determine if we're in EDT or EST and set market hours accordingly
  const isEDT = isDaylightSavingTime(now);
  let marketOpen, marketClose;

  if (isEDT) {
    // EDT: UTC-4
    marketOpen = 13 * 60 + 30; // 13:30 UTC = 9:30 AM EDT
    marketClose = 20 * 60; // 20:00 UTC = 4:00 PM EDT
  } else {
    // EST: UTC-5
    marketOpen = 14 * 60 + 30; // 14:30 UTC = 9:30 AM EST
    marketClose = 21 * 60; // 21:00 UTC = 4:00 PM EST
  }

  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

/**
 * Fetches the current price for a single stock ticker from the Finnhub API.
 * @param {string} ticker - The stock ticker symbol to fetch.
 * @param {string} apiKey - The Finnhub API key.
 * @returns {Promise<object>} An object containing the ticker, price, and percent change.
 * @throws {Error} If the API call fails or returns invalid data.
 */
async function fetchTickerPrice(ticker, apiKey) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Finnhub API error for ${ticker}: ${response.status} - ${errorBody}`);
      throw new Error(`Finnhub API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();

    // Finnhub API returns 'c' for current price. If it's 0, the data is invalid.
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
 * Handles POST requests to refresh the ETF prices. It checks if the market is open,
 * fetches the latest prices for all configured tickers, and updates them in the database.
 * @param {object} context - The Cloudflare Worker context object.
 * @returns {Response} A JSON response summarizing the result of the refresh operation.
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
    // Parse request body for force parameter
    let force = false;
    try {
      const body = await request.json();
      force = body.force === true;
    } catch (e) {
      // No body or invalid JSON - use default
    }

    // Check if market is open (unless forced)
    if (!force && !isMarketOpen()) {
      console.log('📴 Market is closed, skipping price refresh');
      return jsonResponse({
        ok: true,
        message: 'Market is closed',
        skipped: true,
        marketOpen: false,
      }, 200, env);
    }

    if (force) {
      console.log('💪 Forced price refresh (bypassing market hours check)...');
    } else {
      console.log('📈 Market is open, fetching prices...');
    }

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
      // Store the ticker price
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

      // If this is VOO, also store the converted Voya 0899 price
      if (ticker === 'VOO') {
        const voyaPrice = price / VOYA_CONVERSION_RATIO;
        const { error: voyaError } = await supabase
          .from('current_etf_prices')
          .upsert({
            ticker: 'VOYA_0899',
            price: voyaPrice,
            change_percent: changePercent, // Same % change as VFIAX
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'ticker',
          });

        if (voyaError) {
          console.error('Failed to update VOYA_0899:', voyaError);
          throw voyaError;
        }

        updates.push({ ticker: 'VOYA_0899', price: voyaPrice, changePercent });
        console.log(`✅ Stored VOYA_0899 price: $${voyaPrice.toFixed(4)} (VOO $${price} ÷ ${VOYA_CONVERSION_RATIO})`);
      }
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
