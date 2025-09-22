// Market Data Service - Live pricing for ETFs and stocks
// Uses Alpha Vantage free tier (5 calls/minute limit)

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const DEFAULT_API_KEY = 'demo'; // Replace with actual key
const RATE_LIMIT_DELAY = 12000; // 12 seconds between calls (5 calls/minute)

class MarketDataService {
  constructor() {
    this.apiKey = (typeof window !== 'undefined' && (import.meta?.env?.VITE_ALPHA_VANTAGE_API_KEY || import.meta?.env?.ALPHA_VANTAGE_API_KEY)) || DEFAULT_API_KEY;
    console.log('MarketDataService initialized with API key:', this.apiKey === 'demo' ? 'DEMO KEY' : 'REAL KEY');
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastApiCall = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
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
      const serverResponse = await this.fetchFromServer([cleanSymbol]);
      if (serverResponse && serverResponse[cleanSymbol]) {
        const priceData = serverResponse[cleanSymbol];
        this.setCachedPrice(cleanSymbol, priceData);
        return priceData;
      }
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

    try {
      const response = await fetch('/api/fetch-live-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': authToken
        },
        body: JSON.stringify({
          symbols: symbols,
          useDemo: false
        })
      });

      if (!response.ok) {
        throw new Error(`Server API returned ${response.status}`);
      }

      const result = await response.json();
      if (result.ok) {
        return result.data;
      } else {
        throw new Error(result.error || 'Server API failed');
      }
    } catch (error) {
      console.error('Server API call failed:', error);
      throw error;
    }
  }

  // Generate demo/fallback price data
  getDemoPrice(symbol) {
    console.log(`getDemoPrice called for ${symbol}`);
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

      // M1 Finance ETFs (approximate current market values)
      'QQQM': { price: 246.44, change: 0.26 },
      'AVUV': { price: 100.16, change: 0.08 },
      'DES': { price: 33.92, change: 0.00 },
      'SCHD': { price: 27.27, change: 0.01 },
      'JEPI': { price: 56.82, change: 0.01 },
      'GNOM': { price: 37.47, change: 0.03 },
      'MJ': { price: 32.02, change: 0.01 },
      'SMH': { price: 317.78, change: 0.16 },
      'XT': { price: 71.54, change: 0.03 },
      'MSOS': { price: 4.47, change: 0.03 },
      'XBI': { price: 95.89, change: 0.16 },
      'YOLO': { price: 3.23, change: 0.02 },
      'IBB': { price: 142.57, change: 0.15 },

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

    console.log(`Demo price for ${symbol}:`, demo);
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
    console.log('getBatchPrices called with symbols:', symbols);
    if (!Array.isArray(symbols) || symbols.length === 0) {
      console.log('No symbols to fetch prices for');
      return {};
    }

    const results = {};
    const uniqueSymbols = [...new Set(symbols.map(s => s.trim().toUpperCase()))];

    // Check cache first
    const uncachedSymbols = [];
    for (const symbol of uniqueSymbols) {
      const cached = this.getCachedPrice(symbol);
      if (cached) {
        results[symbol] = cached;
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    console.log('Fetching uncached symbols:', uncachedSymbols);

    // Fetch uncached symbols with rate limiting
    for (const symbol of uncachedSymbols) {
      try {
        console.log(`Calling getLivePrice for ${symbol}`);
        const priceData = await this.getLivePrice(symbol);
        console.log(`Got price data for ${symbol}:`, priceData);
        results[symbol] = priceData;
      } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error);
        results[symbol] = {
          symbol,
          error: error.message,
          isStale: true
        };
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