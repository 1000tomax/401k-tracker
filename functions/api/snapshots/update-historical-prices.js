/**
 * @file functions/api/snapshots/update-historical-prices.js
 * @description Updates existing snapshots with accurate historical prices from Finnhub API.
 * This is a one-time backfill operation to replace transaction-based NAVs with actual
 * historical market closing prices.
 *
 * Fixed issues:
 * - Batches database updates to avoid Cloudflare subrequest limits
 * - Proper date matching with Finnhub data
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

const VOYA_CONVERSION_RATIO = 15.577; // VOO to Voya 0899 conversion ratio

/**
 * Fetches historical closing prices from Finnhub for a date range
 * @param {string} symbol - Stock ticker symbol
 * @param {number} fromTimestamp - Start date as UNIX timestamp
 * @param {number} toTimestamp - End date as UNIX timestamp
 * @param {string} apiKey - Finnhub API key
 * @returns {Promise<Map>} Map of date string to closing price
 */
async function fetchHistoricalPrices(symbol, fromTimestamp, toTimestamp, apiKey) {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromTimestamp}&to=${toTimestamp}&token=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.c || !data.t) {
      console.log(`No data returned for ${symbol}, status: ${data.s}`);
      return new Map();
    }

    // Build map of date -> closing price
    const priceMap = new Map();
    for (let i = 0; i < data.t.length; i++) {
      // Finnhub returns timestamps at midnight UTC, convert to YYYY-MM-DD
      const date = new Date(data.t[i] * 1000);
      const dateStr = date.toISOString().split('T')[0];
      priceMap.set(dateStr, data.c[i]);
    }

    console.log(`Fetched ${symbol}: ${priceMap.size} days of data`);
    return priceMap;
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    return new Map();
  }
}

/**
 * Converts date string to UNIX timestamp
 */
function dateToTimestamp(dateString) {
  return Math.floor(new Date(dateString + 'T00:00:00Z').getTime() / 1000);
}

/**
 * POST handler - Update snapshots with historical prices
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
    const supabase = createSupabaseAdmin(env);
    const finnhubKey = env.FINNHUB_API_KEY;

    if (!finnhubKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    console.log('📈 Starting historical price update...');

    // Get all snapshots that need updating
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, snapshot_source')
      .order('snapshot_date', { ascending: true });

    if (snapshotsError) throw snapshotsError;

    if (!snapshots || snapshots.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'No snapshots found to update',
      }, 400, env);
    }

    console.log(`Found ${snapshots.length} snapshots to update`);

    const dates = snapshots.map(s => s.snapshot_date);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Add buffer to ensure we get all needed dates
    const fromTimestamp = dateToTimestamp(startDate) - 86400; // Start 1 day before
    const toTimestamp = dateToTimestamp(endDate) + 86400; // End 1 day after

    console.log(`Fetching historical prices from ${startDate} to ${endDate}`);

    // Fetch historical prices for all tickers
    const tickers = ['VTI', 'QQQM', 'DES', 'SCHD', 'VOO'];
    const historicalPrices = new Map();

    for (const ticker of tickers) {
      console.log(`Fetching ${ticker}...`);
      try {
        const prices = await fetchHistoricalPrices(ticker, fromTimestamp, toTimestamp, finnhubKey);
        historicalPrices.set(ticker, prices);

        // Show sample of dates fetched
        if (prices.size > 0) {
          const sampleDates = Array.from(prices.keys()).slice(0, 3);
          console.log(`  Sample dates: ${sampleDates.join(', ')}`);
        }

        // Rate limit: 60 calls/min, so wait 1 second between calls
        await new Promise(resolve => setTimeout(resolve, 1100));
      } catch (error) {
        console.error(`Failed to fetch ${ticker}:`, error);
      }
    }

    let updated = 0;
    let errors = 0;
    const debugInfo = [];

    // Process dates in batches to avoid subrequest limit
    const BATCH_SIZE = 5; // Process 5 dates at a time

    for (let batchStart = 0; batchStart < dates.length; batchStart += BATCH_SIZE) {
      const batchDates = dates.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`Processing batch: ${batchDates[0]} to ${batchDates[batchDates.length - 1]}`);

      for (const date of batchDates) {
        try {
          // Get holdings for this date
          const { data: holdings, error: holdingsError } = await supabase
            .from('holdings_snapshots')
            .select('*')
            .eq('snapshot_date', date);

          if (holdingsError) throw holdingsError;

          if (!holdings || holdings.length === 0) {
            console.log(`No holdings for ${date}, skipping`);
            continue;
          }

          let totalMarketValue = 0;
          let totalCostBasis = 0;
          let pricesFound = 0;
          let pricesMissing = 0;

          // Collect all holding updates for batch processing
          const holdingUpdates = [];

          // Recalculate each holding with historical price
          for (const holding of holdings) {
            let historicalPrice = null;
            let priceSource = 'transaction';
            let matchedTicker = null;

            // Check if it's Voya fund (use VOO as proxy)
            if (holding.fund.includes('0899') || holding.fund.toLowerCase().includes('vanguard 500')) {
              const vooPrices = historicalPrices.get('VOO');
              if (vooPrices && vooPrices.has(date)) {
                historicalPrice = vooPrices.get(date) / VOYA_CONVERSION_RATIO;
                priceSource = 'proxy';
                matchedTicker = 'VOO';
                pricesFound++;
              } else {
                pricesMissing++;
              }
            } else {
              // Try to match ticker from fund name
              for (const ticker of tickers) {
                if (holding.fund.includes(ticker)) {
                  const prices = historicalPrices.get(ticker);
                  if (prices && prices.has(date)) {
                    historicalPrice = prices.get(date);
                    priceSource = 'historical';
                    matchedTicker = ticker;
                    pricesFound++;
                    break;
                  } else {
                    pricesMissing++;
                  }
                }
              }
            }

            // Calculate values
            const unitPrice = historicalPrice || parseFloat(holding.unit_price);
            const shares = parseFloat(holding.shares);
            const marketValue = shares * unitPrice;
            const costBasis = parseFloat(holding.cost_basis);
            const gainLoss = marketValue - costBasis;

            totalMarketValue += marketValue;
            totalCostBasis += costBasis;

            // Store update for batch processing
            holdingUpdates.push({
              id: holding.id,
              unit_price: unitPrice,
              market_value: marketValue,
              gain_loss: gainLoss,
              price_source: priceSource,
              price_timestamp: historicalPrice ? new Date(date + 'T16:00:00-04:00').toISOString() : null,
            });
          }

          // Batch update all holdings for this date
          for (const update of holdingUpdates) {
            const { error: updateError } = await supabase
              .from('holdings_snapshots')
              .update({
                unit_price: update.unit_price,
                market_value: update.market_value,
                gain_loss: update.gain_loss,
                price_source: update.price_source,
                price_timestamp: update.price_timestamp,
              })
              .eq('id', update.id);

            if (updateError) {
              console.error(`Error updating holding ${update.id}:`, updateError);
            }
          }

          const totalGainLoss = totalMarketValue - totalCostBasis;
          const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

          // Update portfolio snapshot
          const { error: updatePortfolioError } = await supabase
            .from('portfolio_snapshots')
            .update({
              total_market_value: totalMarketValue,
              total_gain_loss: totalGainLoss,
              total_gain_loss_percent: totalGainLossPercent,
              snapshot_source: 'backfill-historical',
              metadata: {
                updated_with_historical_prices: true,
                update_timestamp: new Date().toISOString(),
                prices_found: pricesFound,
                prices_missing: pricesMissing,
              },
            })
            .eq('snapshot_date', date);

          if (updatePortfolioError) {
            console.error(`Error updating portfolio snapshot for ${date}:`, updatePortfolioError);
            debugInfo.push({
              date,
              status: 'error',
              error: updatePortfolioError.message,
            });
            errors++;
          } else {
            console.log(`✓ Updated ${date}: $${totalMarketValue.toFixed(2)} (${pricesFound} prices found, ${pricesMissing} missing)`);
            debugInfo.push({
              date,
              status: pricesMissing === 0 ? 'success' : 'partial',
              pricesFound,
              pricesMissing,
              marketValue: totalMarketValue,
            });
            updated++;
          }

        } catch (error) {
          console.error(`Error processing ${date}:`, error);
          debugInfo.push({
            date,
            status: 'exception',
            error: error.message,
          });
          errors++;
        }
      }

      // Small delay between batches
      if (batchStart + BATCH_SIZE < dates.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Update complete: ${updated} snapshots updated, ${errors} errors`);

    return jsonResponse({
      ok: true,
      updated,
      errors,
      total: dates.length,
      dateRange: {
        start: startDate,
        end: endDate,
      },
      debug: debugInfo,
    }, 200, env);

  } catch (error) {
    console.error('Error updating historical prices:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to update historical prices',
      details: error.message,
    }, 500, env);
  }
}
