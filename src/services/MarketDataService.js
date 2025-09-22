// Market Data Service - Live pricing for ETFs and stocks
// Uses Alpha Vantage free tier (5 calls/minute limit)

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const DEFAULT_API_KEY = 'demo'; // Replace with actual key
const RATE_LIMIT_DELAY = 12000; // 12 seconds between calls (5 calls/minute)

class MarketDataService {
  constructor() {
    this.apiKey = (typeof window !== 'undefined' && (import.meta?.env?.VITE_ALPHA_VANTAGE_API_KEY || import.meta?.env?.ALPHA_VANTAGE_API_KEY)) || DEFAULT_API_KEY;
    console.log('📊 MarketDataService initialized with', this.apiKey === 'demo' ? 'DEMO KEY' : 'REAL KEY');
    this.cache = new Map();
    this.cacheTimeout = 3 * 60 * 1000; // 3 minutes - longer cache for rate limiting
    this.lastApiCall = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastBatchUpdate = 0;
    this.batchUpdateInterval = 2 * 60 * 1000; // Only update all prices every 2 minutes
  }

  // Get cached price or return null
  getCachedPrice(symbol) {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(symbol);
    }
    return null;
  }

  // Set cached price
  setCachedPrice(symbol, data) {
    this.cache.set(symbol, {
      data,
      timestamp: Date.now()
    });
  }

  // Rate-limited API call
  async makeApiCall(url) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;

    if (timeSinceLastCall < RATE_LIMIT_DELAY) {
      const waitTime = RATE_LIMIT_DELAY - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastApiCall = Date.now();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Alpha Vantage API call failed:', error);
      throw error;
    }
  }

  // Parse Alpha Vantage response
  parseQuoteData(data, symbol) {
    console.log('Alpha Vantage raw response for', symbol, ':', data);
    console.log('Response keys:', Object.keys(data));

    const quote = data['Global Quote'];
    if (!quote) {
      console.warn('No Global Quote found. Response keys:', Object.keys(data));
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
      price: price,
      change: change,
      changePercent: changePercent,
      lastUpdated: quote['07. latest trading day'],
      isStale: false,
      source: 'alphavantage'
    };
  }

  // Fetch live price for single symbol
  async getLivePrice(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol provided');
    }

    const cleanSymbol = symbol.trim().toUpperCase();

    // Check cache first
    const cached = this.getCachedPrice(cleanSymbol);
    if (cached) {
      return cached;
    }

    // Try server-side API first (bypasses CORS)
    try {
      console.log(`Trying server-side API first for ${cleanSymbol}`);
      const serverResponse = await this.fetchFromServer([cleanSymbol]);
      console.log(`Server API response for ${cleanSymbol}:`, serverResponse);
      if (serverResponse && serverResponse[cleanSymbol]) {
        const priceData = serverResponse[cleanSymbol];
        console.log(`Using server-side price data for ${cleanSymbol}:`, priceData);
        this.setCachedPrice(cleanSymbol, priceData);
        return priceData;
      }
      console.log(`No server-side data for ${cleanSymbol}, falling back to direct API`);
    } catch (serverError) {
      console.warn('Server API failed, trying direct call:', serverError);
    }

    // Use demo data if no API key
    if (this.apiKey === 'demo') {
      return this.getDemoPrice(cleanSymbol);
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${cleanSymbol}&apikey=${this.apiKey}`;
      console.log(`Making Alpha Vantage API call for ${cleanSymbol}:`, url);
      const data = await this.makeApiCall(url);
      console.log(`Alpha Vantage API response for ${cleanSymbol}:`, data);

      const priceData = this.parseQuoteData(data, cleanSymbol);

      // Validate price against demo data to catch obviously wrong API responses
      const demoData = this.getDemoPrice(cleanSymbol);
      if (demoData && !demoData.fallback) {
        // For symbols with known demo prices, validate API response
        const priceDiff = Math.abs(priceData.price - demoData.price);
        const percentDiff = priceDiff / demoData.price;

        // Reject API prices that differ by more than 20% from expected
        if (percentDiff > 0.20) {
          console.warn(`API price for ${cleanSymbol} ($${priceData.price}) differs by ${(percentDiff * 100).toFixed(1)}% from expected (~$${demoData.price}). Using demo data.`);
          return {
            ...demoData,
            isStale: true,
            source: 'demo_fallback',
            apiPrice: priceData.price,
            rejectedReason: `Price difference: ${(percentDiff * 100).toFixed(1)}%`
          };
        }
      }

      this.setCachedPrice(cleanSymbol, priceData);
      return priceData;
    } catch (error) {
      console.error(`Failed to fetch price for ${cleanSymbol}:`, error);

      // Return demo data as fallback
      const fallbackData = this.getDemoPrice(cleanSymbol);
      fallbackData.isStale = true;
      fallbackData.error = error.message;

      return fallbackData;
    }
  }

  // Fetch prices via server-side API (bypasses CORS)
  async fetchFromServer(symbols) {
    // Get the auth token from the environment (same as main app)
    const authToken =
      (import.meta.env && import.meta.env.VITE_401K_TOKEN) ||
      (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_401K_TOKEN : undefined) ||
      'dev-only-token';

    // Rotate which 4 symbols get live prices (cycles every 2 minutes)
    const rotationIndex = Math.floor(Date.now() / (2 * 60 * 1000)) % Math.ceil(symbols.length / 4);
    const startIndex = rotationIndex * 4;
    const endIndex = Math.min(startIndex + 4, symbols.length);
    const prioritySymbols = symbols.slice(startIndex, endIndex);
    const remainingSymbols = [...symbols.slice(0, startIndex), ...symbols.slice(endIndex)];

    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const nextUpdateTime = new Date(now.getTime() + 2 * 60 * 1000).toLocaleTimeString();
    console.log(`🔄 ${timeStr} - Rotation cycle ${rotationIndex + 1}: Fetching LIVE prices for [${prioritySymbols.join(', ')}] (next update ~${nextUpdateTime})`);

    const allResults = {};

    // Fetch live prices for priority symbols
    if (prioritySymbols.length > 0) {
      try {
        const response = await fetch('/api/fetch-live-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-401K-Token': authToken
          },
          body: JSON.stringify({
            symbols: prioritySymbols,
            useDemo: false
          })
        });

        if (!response.ok) {
          throw new Error(`Server API returned ${response.status}`);
        }

        const result = await response.json();
        if (result.ok) {
          Object.assign(allResults, result.data);
        } else {
          console.warn(`⚠️ Live price fetch failed:`, result.error);
          // Add demo fallbacks for failed symbols
          prioritySymbols.forEach(symbol => {
            allResults[symbol] = this.getDemoPrice(symbol);
          });
        }
      } catch (error) {
        console.error(`⚠️ Live price API error:`, error.message);
        // Add demo fallbacks for failed symbols
        prioritySymbols.forEach(symbol => {
          allResults[symbol] = this.getDemoPrice(symbol);
        });
      }
    }

    // Use demo prices for remaining symbols
    remainingSymbols.forEach(symbol => {
      allResults[symbol] = this.getDemoPrice(symbol);
    });

    return allResults;
  }

  // Generate demo/fallback price data
  getDemoPrice(symbol) {
    // Realistic demo prices for common ETFs (based on actual recent prices)
    const demoPrices = {
      // Common ETFs
      'VTI': { price: 329.98, change: 1.54 },
      'VXUS': { price: 73.12, change: -0.25 },
      'BND': { price: 79.85, change: 0.12 },
      'VB': { price: 182.30, change: 1.80 },
      'SPY': { price: 445.20, change: 3.50 },
      'QQQ': { price: 385.60, change: 4.20 },
      'IWM': { price: 195.80, change: -1.20 },
      'EFA': { price: 72.40, change: 0.85 },
      'VEA': { price: 49.60, change: 0.25 },
      'VWO': { price: 53.95, change: -0.30 },

      // M1 Finance ETFs (based on recent Alpha Vantage data)
      'QQQM': { price: 246.79, change: 1.67 },
      'AVUV': { price: 100.71, change: -1.41 },
      'DES': { price: 34.03, change: -0.51 },
      'SCHD': { price: 27.33, change: -0.12 },
      'JEPI': { price: 56.86, change: -0.07 },
      'GNOM': { price: 37.56, change: -0.38 },
      'MJ': { price: 32.32, change: -0.59 },
      'SMH': { price: 315.71, change: -1.26 },
      'XT': { price: 71.43, change: -0.11 },
      'MSOS': { price: 4.45, change: -0.11 },
      'XBI': { price: 95.60, change: -1.08 },
      'YOLO': { price: 3.21, change: -0.06 },
      'IBB': { price: 142.72, change: -0.91 },
      'PCY': { price: 21.64, change: 0.02 },

      // Schwab ETFs
      'SCHH': { price: 21.30, change: -0.05 },
      'SCHF': { price: 23.21, change: -0.12 },
      'SCHB': { price: 25.67, change: 0.18 }
    };

    // If symbol not found, return a more reasonable fallback
    const demo = demoPrices[symbol] || {
      price: 50.00, // More reasonable than $100 for most ETFs
      change: 0.00,
      fallback: true // Flag to indicate this is a generic fallback
    };

    const changePercent = demo.price > 0 ? `${(demo.change / demo.price * 100).toFixed(2)}%` : '0.00%';

    return {
      symbol,
      price: demo.price,
      change: demo.change,
      changePercent: demo.change >= 0 ? `+${changePercent}` : changePercent,
      lastUpdated: new Date().toISOString().split('T')[0],
      isStale: this.apiKey === 'demo',
      source: 'demo'
    };
  }

  // Fetch prices for multiple symbols (batched with rate limiting)
  async getBatchPrices(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {};
    }

    const results = {};
    const uniqueSymbols = [...new Set(symbols.map(s => s.trim().toUpperCase()))];
    const now = Date.now();

    // Check if we should skip API calls due to recent batch update
    const timeSinceLastBatch = now - this.lastBatchUpdate;
    const shouldSkipApiCalls = timeSinceLastBatch < this.batchUpdateInterval;

    // Check cache first and use demo for uncached if skipping API calls
    const uncachedSymbols = [];
    for (const symbol of uniqueSymbols) {
      const cached = this.getCachedPrice(symbol);
      if (cached) {
        results[symbol] = cached;
      } else if (shouldSkipApiCalls) {
        // Use demo data instead of making API calls
        results[symbol] = this.getDemoPrice(symbol);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // Only make API calls if enough time has passed
    if (!shouldSkipApiCalls && uncachedSymbols.length > 0) {
      this.lastBatchUpdate = now;

      // Fetch via server-side API (limited to first 4 symbols)
      try {
        const serverResults = await this.fetchFromServer(uncachedSymbols);
        Object.assign(results, serverResults);
      } catch (error) {
        console.error('⚠️ Live price API failed, using demo data:', error.message);
        // Fallback to demo data for all uncached symbols
        uncachedSymbols.forEach(symbol => {
          results[symbol] = this.getDemoPrice(symbol);
        });
      }
    }

    return results;
  }

  // Get market status (simplified - just check if it's a weekday during market hours)
  getMarketStatus() {
    const now = new Date();
    const easternTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).format(now);

    const [hours, minutes] = easternTime.split(':').map(n => parseInt(n));
    const currentTime = hours * 60 + minutes;

    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM

    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
    const isMarketHours = currentTime >= marketOpen && currentTime < marketClose;

    return {
      isOpen: isWeekday && isMarketHours,
      localOpenTime: '9:30 AM',
      localCloseTime: '4:00 PM',
      timezone: 'ET',
      lastUpdated: now.toISOString(),
      fallback: true // This is a simplified calculation
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Get cache stats
  getCacheStats() {
    const validEntries = Array.from(this.cache.values()).filter(
      entry => Date.now() - entry.timestamp < this.cacheTimeout
    ).length;

    return {
      totalEntries: this.cache.size,
      validEntries,
      staleEntries: this.cache.size - validEntries,
      cacheTimeout: this.cacheTimeout
    };
  }
}

// Export singleton instance
export default new MarketDataService();