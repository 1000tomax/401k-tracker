import { allowCorsAndAuth, requireSharedToken } from '../src/utils/cors.js';

// Simple server-side live pricing endpoint
// This avoids CORS issues and can cache results server-side

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// Alpha Vantage API integration
async function fetchPriceFromAlphaVantage(symbol, apiKey) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const quote = data['Global Quote'];

    if (!quote) {
      throw new Error(`No quote data found for ${symbol}`);
    }

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = quote['10. change percent'];

    if (isNaN(price) || isNaN(change)) {
      throw new Error(`Invalid price data for ${symbol}`);
    }

    return {
      symbol,
      price,
      change,
      changePercent,
      lastUpdated: quote['07. latest trading day'],
      source: 'alphavantage',
      success: true
    };
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
    throw error;
  }
}

// Generate demo price data
function getDemoPrice(symbol) {
  const demoPrices = {
    'VTI': { price: 245.50, change: 2.15 },
    'VXUS': { price: 61.20, change: -0.45 },
    'BND': { price: 79.85, change: 0.12 },
    'VB': { price: 182.30, change: 1.80 },
    'SPY': { price: 445.20, change: 3.50 },
    'QQQ': { price: 385.60, change: 4.20 },
    'IWM': { price: 195.80, change: -1.20 },
    'EFA': { price: 72.40, change: 0.85 },
    'VEA': { price: 49.60, change: 0.25 },
    'VWO': { price: 41.80, change: -0.30 }
  };

  const demo = demoPrices[symbol] || { price: 100.00, change: 0.00 };
  const changePercent = demo.price > 0 ? `${(demo.change / demo.price * 100).toFixed(2)}%` : '0.00%';

  return {
    symbol,
    price: demo.price,
    change: demo.change,
    changePercent: demo.change >= 0 ? `+${changePercent}` : changePercent,
    lastUpdated: new Date().toISOString().split('T')[0],
    source: 'demo',
    success: true
  };
}

export default async function handler(req, res) {
  const cors = allowCorsAndAuth(req, res);
  if (cors.ended) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { ok: false, error: 'Use POST for this endpoint.' });
    return;
  }

  const auth = requireSharedToken(req);
  if (!auth.ok) {
    send(res, auth.status, { ok: false, error: auth.message });
    return;
  }

  try {
    const { symbols = [], useDemo = false } = req.body || {};

    if (!Array.isArray(symbols) || symbols.length === 0) {
      send(res, 400, {
        ok: false,
        error: 'symbols array is required in request body'
      });
      return;
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const results = {};
    const errors = {};

    // Force demo mode if no API key
    const shouldUseDemo = useDemo || !apiKey || apiKey === 'demo';

    if (shouldUseDemo) {
      // Use demo data
      for (const symbol of symbols) {
        const cleanSymbol = symbol.trim().toUpperCase();
        try {
          results[cleanSymbol] = getDemoPrice(cleanSymbol);
        } catch (error) {
          errors[cleanSymbol] = error.message;
        }
      }
    } else {
      // Use real API with rate limiting
      const RATE_LIMIT_DELAY = 12000; // 12 seconds between calls

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i].trim().toUpperCase();

        try {
          // Add delay between API calls (except for first call)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
          }

          results[symbol] = await fetchPriceFromAlphaVantage(symbol, apiKey);
        } catch (error) {
          console.error(`Failed to fetch price for ${symbol}:`, error);
          errors[symbol] = error.message;

          // Provide demo fallback
          try {
            results[symbol] = {
              ...getDemoPrice(symbol),
              isStale: true,
              error: error.message,
              source: 'demo_fallback'
            };
          } catch (fallbackError) {
            errors[symbol] = `${error.message} (fallback also failed)`;
          }
        }
      }
    }

    const successCount = Object.keys(results).length;
    const errorCount = Object.keys(errors).length;

    send(res, 200, {
      ok: true,
      data: results,
      errors: errorCount > 0 ? errors : undefined,
      summary: {
        requested: symbols.length,
        successful: successCount,
        failed: errorCount,
        usingDemo: shouldUseDemo,
        rateLimit: shouldUseDemo ? 'none' : '5 calls/minute',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Live prices API error:', error);
    send(res, 500, {
      ok: false,
      error: error.message || 'Failed to fetch live prices',
      timestamp: new Date().toISOString()
    });
  }
}