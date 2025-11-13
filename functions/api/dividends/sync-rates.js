/**
 * @file functions/api/dividends/sync-rates.js
 * @description Fetches actual dividend per-share rates from Finnhub API and updates existing dividend records.
 * This replaces our calculated estimates with real dividend rates from the fund providers.
 */
import { createSupabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { handleCors, requireSharedToken, jsonResponse } from '../../../src/utils/cors-workers.js';

/**
 * Fetches dividend data for a ticker from Finnhub API
 * @param {string} ticker - The ticker symbol
 * @param {string} apiKey - Finnhub API key
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of dividend records
 */
async function fetchDividendRates(ticker, apiKey, fromDate, toDate) {
  const url = `https://finnhub.io/api/v1/stock/dividend?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Finnhub dividend API error for ${ticker}: ${response.status} - ${errorBody}`);
      return [];
    }

    const data = await response.json();

    // Finnhub returns array of: { date, amount, currency, etc }
    if (!Array.isArray(data)) {
      console.warn(`Unexpected dividend data format for ${ticker}:`, data);
      return [];
    }

    return data.map(div => ({
      date: div.date,
      amount: div.amount,
      currency: div.currency || 'USD',
      exDate: div.exDate || div.date,
      payDate: div.payDate || div.date,
      recordDate: div.recordDate,
      declaredDate: div.declaredDate,
    }));
  } catch (error) {
    console.error(`Failed to fetch dividends for ${ticker}:`, error.message);
    return [];
  }
}

/**
 * POST handler - Sync dividend rates from Finnhub for all holdings
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

    // Get Finnhub API key
    const apiKey = env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
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

    console.log(`📊 Syncing dividend rates from ${fromDate} to ${toDate}...`);

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
    };

    // Fetch dividend rates for each ticker
    for (const ticker of tickers) {
      try {
        console.log(`🔍 Fetching dividend rates for ${ticker}...`);
        const rates = await fetchDividendRates(ticker, apiKey, fromDate, toDate);

        results.tickersChecked++;

        if (rates.length === 0) {
          console.log(`ℹ️ No Finnhub dividend data found for ${ticker}`);
          continue;
        }

        console.log(`✅ Found ${rates.length} Finnhub dividend records for ${ticker}`);

        // Match Finnhub dividends to our records by date
        const tickerDividends = dividends.filter(d => d.fund === ticker);

        for (const ourDiv of tickerDividends) {
          // Try to match by payment date (our date field)
          let matched = rates.find(r => r.payDate === ourDiv.date || r.date === ourDiv.date);

          // If no exact match, try matching within a week
          if (!matched) {
            const ourDate = new Date(ourDiv.date);
            matched = rates.find(r => {
              const rateDate = new Date(r.payDate || r.date);
              const diffDays = Math.abs((ourDate - rateDate) / (1000 * 60 * 60 * 24));
              return diffDays <= 7; // Within a week
            });
          }

          if (matched) {
            results.matched++;

            // Update the dividend record with actual per-share rate
            const { error: updateError } = await supabase
              .from('dividends')
              .update({
                ex_date: matched.exDate,
                record_date: matched.recordDate,
                metadata: {
                  ...ourDiv.metadata,
                  finnhub_rate: matched.amount,
                  finnhub_declared_date: matched.declaredDate,
                  finnhub_synced_at: new Date().toISOString(),
                },
              })
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
                finnhubRate: matched.amount,
                exDate: matched.exDate,
              });
            }
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        results.errors++;
      }
    }

    console.log('✅ Dividend rate sync complete:', results);

    return jsonResponse({
      ok: true,
      message: 'Dividend rates synced successfully',
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
