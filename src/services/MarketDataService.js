// Market Data Service - Live pricing for ETFs and stocks
// Uses Alpha Vantage free tier (5 calls/minute limit)

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const DEFAULT_API_KEY = 'demo'; // Replace with actual key
const RATE_LIMIT_DELAY = 12000; // 12 seconds between calls (5 calls/minute)

class MarketDataService {
  constructor() {
    this.apiKey = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY || DEFAULT_API_KEY;
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
      const data = await this.makeApiCall(url);

      const priceData = this.parseQuoteData(data, cleanSymbol);
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
    try {
      const response = await fetch('/api/fetch-live-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': 'dev-only-token' // Use your actual token
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
    // Realistic demo prices for common ETFs
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

    // Fetch uncached symbols with rate limiting
    for (const symbol of uncachedSymbols) {
      try {
        const priceData = await this.getLivePrice(symbol);
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