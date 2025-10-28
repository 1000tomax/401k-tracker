/**
 * @file functions/api/snapshots/update-historical-prices.js
 * @description Updates existing snapshots with accurate historical prices from Finnhub API.
 * This is a one-time backfill operation to replace transaction-based NAVs with actual
 * historical market closing prices.
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
      throw new Error(`No data returned for ${symbol}`);
    }

    // Build map of date -> closing price
    const priceMap = new Map();
    for (let i = 0; i < data.t.length; i++) {
      const date = new Date(data.t[i] * 1000).toISOString().split('T')[0];
      priceMap.set(date, data.c[i]);
    }

    return priceMap;
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    throw error;
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

    // Get all snapshots that need updating (all sources, not just backfill)
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, snapshot_source')
      .order('snapshot_date', { ascending: true });

    if (snapshotsError) throw snapshotsError;

    if (!snapshots || snapshots.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'No backfilled snapshots found to update',
      }, 400, env);
    }

    console.log(`Found ${snapshots.length} snapshots to update`);

    const dates = snapshots.map(s => s.snapshot_date);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const fromTimestamp = dateToTimestamp(startDate);
    const toTimestamp = dateToTimestamp(endDate) + 86400; // Add 1 day to include end date

    console.log(`Fetching historical prices from ${startDate} to ${endDate}`);

    // Fetch historical prices for all tickers
    const tickers = ['VTI', 'QQQM', 'DES', 'SCHD', 'VOO'];
    const historicalPrices = new Map();

    for (const ticker of tickers) {
      console.log(`Fetching ${ticker}...`);
      try {
        const prices = await fetchHistoricalPrices(ticker, fromTimestamp, toTimestamp, finnhubKey);
        historicalPrices.set(ticker, prices);
        console.log(`✓ ${ticker}: ${prices.size} days`);

        // Rate limit: 60 calls/min, so wait 1 second between calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to fetch ${ticker}:`, error);
      }
    }

    let updated = 0;
    let errors = 0;
    const debugInfo = [];

    // Process each snapshot date
    for (const date of dates) {
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
        const updatedHoldings = [];

        // Recalculate each holding with historical price
        let pricesFound = 0;
        let pricesMissing = 0;

        for (const holding of holdings) {
          let historicalPrice = null;
          let priceSource = 'transaction';

          // Check if it's Voya fund (use VOO as proxy)
          if (holding.fund.includes('0899') || holding.fund.includes('Vanguard 500')) {
            const vooPrices = historicalPrices.get('VOO');
            if (vooPrices && vooPrices.has(date)) {
              historicalPrice = vooPrices.get(date) / VOYA_CONVERSION_RATIO;
              priceSource = 'proxy';
              pricesFound++;
            } else {
              pricesMissing++;
              console.log(`  ⚠️ No VOO price for ${date} (Voya fund)`);
            }
          } else {
            // Try to match ticker from fund name
            let tickerMatched = false;
            for (const ticker of tickers) {
              if (holding.fund.includes(ticker)) {
                tickerMatched = true;
                const prices = historicalPrices.get(ticker);
                if (prices && prices.has(date)) {
                  historicalPrice = prices.get(date);
                  priceSource = 'historical';
                  pricesFound++;
                  break;
                } else {
                  pricesMissing++;
                  console.log(`  ⚠️ No ${ticker} price for ${date}`);
                }
              }
            }
            if (!tickerMatched) {
              pricesMissing++;
              console.log(`  ⚠️ No ticker matched for fund: ${holding.fund}`);
            }
          }

          // Use historical price if available, otherwise keep original
          const unitPrice = historicalPrice || parseFloat(holding.unit_price);
          const shares = parseFloat(holding.shares);
          const marketValue = shares * unitPrice;
          const costBasis = parseFloat(holding.cost_basis);
          const gainLoss = marketValue - costBasis;

          totalMarketValue += marketValue;
          totalCostBasis += costBasis;

          // Update holding snapshot
          const { error: updateError } = await supabase
            .from('holdings_snapshots')
            .update({
              unit_price: unitPrice,
              market_value: marketValue,
              gain_loss: gainLoss,
              price_source: priceSource,
              price_timestamp: historicalPrice ? new Date(date + 'T16:00:00-04:00').toISOString() : null,
            })
            .eq('id', holding.id);

          if (updateError) {
            console.error(`Error updating holding ${holding.id}:`, updateError);
          }

          updatedHoldings.push({
            fund: holding.fund,
            oldPrice: parseFloat(holding.unit_price),
            newPrice: unitPrice,
            priceSource,
          });
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
