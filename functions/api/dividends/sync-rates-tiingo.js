/**
 * @file functions/api/dividends/sync-rates-tiingo.js
 * @description Fetches actual dividend per-share rates from Tiingo API and updates existing dividend records.
 * This replaces our calculated estimates with real dividend rates from the fund providers.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * Fetches ex-dividend dates from Alpha Vantage (optional enrichment)
 * @param {string} ticker - The ticker symbol
 * @param {string} apiKey - Alpha Vantage API key
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<{exDates: Map, errors: Array}>} Map of payment date -> ex-date
 */
async function fetchExDatesFromAlphaVantage(ticker, apiKey, fromDate, toDate) {
  if (!apiKey) {
    return { exDates: new Map(), errors: ['ALPHA_VANTAGE_API_KEY not available'] };
  }

  const url = `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=${ticker}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { exDates: new Map(), errors: [`HTTP ${response.status}`] };
    }

    const data = await response.json();

    // Check for rate limit
    if (data.Note && data.Note.includes('rate limit')) {
      return { exDates: new Map(), errors: ['Rate limited - skipping ex-dates'] };
    }

    if (!data.data || !Array.isArray(data.data)) {
      return { exDates: new Map(), errors: ['Unexpected API format'] };
    }

    // Build map of payment_date -> ex_dividend_date
    const exDates = new Map();
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    data.data
      .filter(div => {
        const payDate = new Date(div.payment_date);
        return payDate >= fromDateObj && payDate <= toDateObj;
      })
      .forEach(div => {
        exDates.set(div.payment_date, div.ex_dividend_date);
      });

    console.log(`📅 Alpha Vantage: Found ${exDates.size} ex-dates for ${ticker}`);
    return { exDates, errors: [] };

  } catch (error) {
    return { exDates: new Map(), errors: [error.message] };
  }
}

/**
 * Fetches dividend data for a ticker from Tiingo API
 * @param {string} ticker - The ticker symbol
 * @param {string} apiKey - Tiingo API key
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<{rates: Array, debug: Object}>} Object with rates array and debug info
 */
async function fetchDividendRates(ticker, apiKey, fromDate, toDate) {
  const url = `https://api.tiingo.com/tiingo/daily/${ticker}/prices?token=${apiKey}&startDate=${fromDate}&endDate=${toDate}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Tiingo dividend API error for ${ticker}: ${response.status} - ${errorBody}`);
      return {
        rates: [],
        debug: {
          error: `HTTP ${response.status}: ${errorBody}`,
          totalBeforeFilter: 0,
          totalAfterFilter: 0,
        }
      };
    }

    const data = await response.json();

    // Log raw API response for debugging
    console.log(`📡 Tiingo raw response for ${ticker}:`, JSON.stringify(data).substring(0, 500));

    // Tiingo returns: [{ date, divCash, ... }]
    if (!Array.isArray(data)) {
      console.warn(`Unexpected dividend data format for ${ticker}:`, data);
      return {
        rates: [],
        debug: {
          error: 'Unexpected API response format',
          responseKeys: Object.keys(data || {}),
          responseSample: JSON.stringify(data).substring(0, 200),
          totalBeforeFilter: 0,
          totalAfterFilter: 0,
        }
      };
    }

    console.log(`📊 Found ${data.length} total price records for ${ticker} before dividend filtering`);

    // Filter for records with dividends (divCash > 0)
    const dividends = data
      .filter(record => record.divCash && record.divCash > 0)
      .map(record => ({
        date: record.date.split('T')[0], // Convert to YYYY-MM-DD format
        amount: parseFloat(record.divCash),
        currency: 'USD',
        exDate: null, // Tiingo doesn't provide ex-date in this endpoint
        payDate: record.date.split('T')[0], // Use the date as payment date
        recordDate: null, // Not available
        declaredDate: null, // Not available
      }));

    console.log(`🔍 After filtering for dividends: ${dividends.length} dividend payments for ${ticker}`);
    if (data.length > 0 && dividends.length === 0) {
      console.warn(`⚠️ No dividends found in ${data.length} price records! Latest record date: ${data[data.length - 1]?.date}`);
    }

    return {
      rates: dividends,
      debug: {
        totalBeforeFilter: data.length,
        totalAfterFilter: dividends.length,
        latestRecordDate: data[data.length - 1]?.date || null,
        sampleDividends: dividends.slice(0, 3).map(d => ({ date: d.date, amount: d.amount })),
      }
    };
  } catch (error) {
    console.error(`Failed to fetch dividends for ${ticker}:`, error.message);
    return {
      rates: [],
      debug: {
        error: error.message,
        totalBeforeFilter: 0,
        totalAfterFilter: 0,
      }
    };
  }
}

/**
 * POST handler - Sync dividend rates from Tiingo for all holdings
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

    // Get Tiingo API key
    const apiKey = env.TIINGO_API_KEY;
    if (!apiKey) {
      throw new Error('TIINGO_API_KEY not configured');
    }

    // Parse request for date range (default to last 12 months)
    let fromDate, toDate;
    try {
      const body = await request.json();
      fromDate = body.fromDate;
      toDate = body.toDate;
    } catch (e) {
      // Use defaults
    }

    if (!fromDate) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      fromDate = oneYearAgo.toISOString().split('T')[0];
    }

    if (!toDate) {
      toDate = new Date().toISOString().split('T')[0];
    }

    console.log(`📊 Syncing dividend rates from ${fromDate} to ${toDate} using Tiingo API...`);

    // Get all unique fund tickers from dividends table
    const { data: dividends, error: divError } = await supabase
      .from('dividends')
      .select('fund, date, amount, id')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: false });

    if (divError) {
      throw new Error(`Failed to fetch dividends: ${divError.message}`);
    }

    if (!dividends || dividends.length === 0) {
      return jsonResponse({
        ok: true,
        message: 'No dividends found in date range',
        updated: 0,
      }, 200, env);
    }

    // Get unique tickers
    const tickers = [...new Set(dividends.map(d => d.fund))];
    console.log(`📈 Found ${tickers.length} unique tickers with dividends:`, tickers);

    const results = {
      totalDividends: dividends.length,
      tickersChecked: 0,
      matched: 0,
      updated: 0,
      errors: 0,
      details: [],
      tickerDetails: [],
    };

    // Fetch dividend rates for each ticker
    for (const ticker of tickers) {
      try {
        console.log(`🔍 Fetching dividend rates for ${ticker} from Tiingo...`);
        const { rates, debug: apiDebug } = await fetchDividendRates(ticker, apiKey, fromDate, toDate);

        results.tickersChecked++;

        // Match Tiingo dividends to our records by date
        const tickerDividends = dividends.filter(d => d.fund === ticker);

        // Add debug info
        const tickerDebug = {
          ticker,
          ourDividendCount: tickerDividends.length,
          ourDates: tickerDividends.map(d => d.date),
          tiingoCount: rates.length,
          tiingoDates: rates.slice(0, 5).map(r => r.payDate),
          tiingoAmounts: rates.slice(0, 5).map(r => r.amount),
          apiDebug, // Add raw API debug info
        };
        results.tickerDetails.push(tickerDebug);

        if (rates.length === 0) {
          console.log(`ℹ️ No Tiingo dividend data found for ${ticker}`);
          continue;
        }

        console.log(`✅ Found ${rates.length} Tiingo dividend records for ${ticker}`);

        // Optional: Enrich with ex-dates from Alpha Vantage (if available and not rate limited)
        let exDatesMap = new Map();
        const alphaVantageKey = env.ALPHA_VANTAGE_API_KEY;
        if (alphaVantageKey && rates.length > 0) {
          console.log(`📅 Attempting to enrich ${ticker} with ex-dates from Alpha Vantage...`);
          const { exDates, errors } = await fetchExDatesFromAlphaVantage(ticker, alphaVantageKey, fromDate, toDate);
          exDatesMap = exDates;
          
          if (errors.length > 0) {
            console.log(`⚠️ Alpha Vantage ex-date enrichment issues for ${ticker}:`, errors.join(', '));
          } else if (exDatesMap.size > 0) {
            console.log(`📅 Successfully enriched ${ticker} with ${exDatesMap.size} ex-dates`);
          }
        }

        console.log(`📋 Our dividends for ${ticker}:`, tickerDividends.map(d => ({ date: d.date, dateType: typeof d.date })));
        console.log(`📊 Tiingo rates:`, rates.map(r => ({ payDate: r.payDate, amount: r.amount })));

        for (const ourDiv of tickerDividends) {
          // Normalize our date to YYYY-MM-DD string for comparison
          const ourDateStr = ourDiv.date instanceof Date
            ? ourDiv.date.toISOString().split('T')[0]
            : String(ourDiv.date);

          // Normalize to YYYY-MM-DD format (handle edge cases)
          const normalizedOurDate = ourDateStr.split('T')[0]; // Remove time if present

          // Try to match by payment date (our date field)
          let matched = rates.find(r => {
            const ratePayDate = String(r.payDate).split('T')[0]; // Normalize Tiingo date
            return ratePayDate === normalizedOurDate;
          });

          console.log(`🔍 Matching dividend ${normalizedOurDate} (original: ${ourDiv.date}, type: ${typeof ourDiv.date}):`, matched ? `FOUND (${matched.payDate} = $${matched.amount})` : 'NOT FOUND');
          if (!matched && rates.length > 0) {
            console.log(`   Available Tiingo dates: ${rates.map(r => r.payDate).join(', ')}`);
          }

          // If no exact match, try matching within a week
          if (!matched) {
            const ourDate = new Date(normalizedOurDate);
            matched = rates.find(r => {
              const rateDate = new Date(String(r.payDate).split('T')[0]);
              const diffDays = Math.abs((ourDate - rateDate) / (1000 * 60 * 60 * 24));
              return diffDays <= 7; // Within a week
            });

            if (matched) {
              console.log(`   ⚠️ FUZZY MATCHED ${normalizedOurDate} to ${matched.payDate} (${Math.abs((ourDate - new Date(matched.payDate)) / (1000 * 60 * 60 * 24)).toFixed(1)} days apart)`);
            }
          }

          if (matched) {
            results.matched++;

            // Look up ex-date if available
            const exDate = exDatesMap.get(matched.payDate) || null;

            // Update the dividend record with actual per-share rate and optional ex-date
            const updateData = {
              metadata: {
                ...ourDiv.metadata,
                tiingo_rate: matched.amount,
                tiingo_synced_at: new Date().toISOString(),
                source: 'tiingo',
              },
            };

            // Add ex-date if we found one
            if (exDate) {
              updateData.ex_date = exDate;
              updateData.metadata.alpha_vantage_ex_date = exDate;
              updateData.metadata.ex_date_source = 'alpha_vantage';
            }

            const { error: updateError } = await supabase
              .from('dividends')
              .update(updateData)
              .eq('id', ourDiv.id);

            if (updateError) {
              console.error(`Failed to update dividend ${ourDiv.id}:`, updateError);
              results.errors++;
            } else {
              results.updated++;
              results.details.push({
                ticker,
                date: ourDiv.date,
                ourAmount: ourDiv.amount,
                tiingoRate: matched.amount,
                payDate: matched.payDate,
                exDate: exDate || 'not available',
              });
            }
          }
        }

        // Small delay to be respectful to API (though Tiingo has high limits)
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        results.errors++;
      }
    }

    console.log('✅ Tiingo dividend rate sync complete:', results);

    return jsonResponse({
      ok: true,
      message: 'Dividend rates synced successfully with Tiingo',
      results,
    }, 200, env);

  } catch (error) {
    console.error('❌ Error syncing dividend rates:', error);
    return jsonResponse({
      ok: false,
      error: 'Failed to sync dividend rates',
      details: error.message,
    }, 500, env);
  }
}