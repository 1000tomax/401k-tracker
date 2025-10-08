/**
 * @file src/services/VoyaService.js
 * @description Service for handling live pricing of Voya 401k fund 0899 using VFIAX as a proxy.
 * Implements client-side caching and position calculation from transaction history.
 * Uses existing price fetching infrastructure via VOYA_0899 ticker stored in database.
 */

/**
 * Ticker symbol for Voya 401k fund in the database.
 * Represents the converted price from VFIAX (÷ 15.73 ratio).
 * @type {string}
 */
const VOYA_TICKER = 'VOYA_0899';

/**
 * Service class for Voya 401k live pricing and position tracking.
 * Fetches live prices from the database and calculates current positions from transaction history.
 */
export class VoyaService {
  /**
   * Creates a new VoyaService instance.
   * @param {string} apiUrl - Base API URL for fetching prices
   * @param {string} token - Authentication token for API requests
   */
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.cache = {
      price: null,
      timestamp: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    };
  }

  /**
   * Fetches the current Voya fund price from the database.
   * Implements 5-minute client-side caching to reduce API calls.
   * Falls back to cached price if API request fails.
   * @returns {Promise<number|null>} Current Voya fund price, or null if unavailable
   */
  async getCurrentVoyaPrice() {
    // Check cache first
    if (this.cache.price && (Date.now() - this.cache.timestamp < this.cache.ttl)) {
      console.log('📦 Using cached Voya price:', this.cache.price);
      return this.cache.price;
    }

    try {
      // Fetch all prices from /api/prices/latest
      const response = await fetch(`${this.apiUrl}/api/prices/latest`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch Voya price, using cached or fallback');
        return this.cache.price; // Return cached price on error
      }

      const data = await response.json();

      if (!data.ok || !data.prices || !data.prices[VOYA_TICKER]) {
        console.warn('VOYA_0899 price not found in response');
        return this.cache.price; // Return cached price if not found
      }

      const voyaPrice = data.prices[VOYA_TICKER].price;
      const priceUpdatedAt = data.prices[VOYA_TICKER].updatedAt;

      // Update cache
      this.cache.price = voyaPrice;
      this.cache.timestamp = Date.now();
      this.cache.priceUpdatedAt = priceUpdatedAt; // Store when the price was actually updated

      console.log(`📈 Fetched live Voya price: $${voyaPrice.toFixed(4)} (updated at ${priceUpdatedAt})`);
      return voyaPrice;
    } catch (error) {
      console.error('Error fetching Voya price:', error);
      return this.cache.price; // Fallback to cached price
    }
  }

  /**
   * Enriches Voya transaction data with live pricing to create a holding object.
   * Calculates current position (shares, cost basis) from transaction history and
   * applies the latest live price to compute market value and gains/losses.
   * @param {Array<Object>} transactions - Array of Voya transaction objects from database
   * @returns {Promise<Object|null>} Enriched holding object with live pricing, or null if no active position
   * @property {string} fund - Fund display name
   * @property {string} accountName - Account identifier
   * @property {number} shares - Current share count
   * @property {number} latestNAV - Current price per share
   * @property {number} marketValue - Current market value (shares × price)
   * @property {number} costBasis - Total cost basis
   * @property {number} gainLoss - Unrealized gain/loss
   * @property {number} avgCost - Average cost per share
   * @property {boolean} isVoyaLive - Flag indicating live pricing is active
   */
  async enrichVoyaHoldings(transactions) {
    if (!transactions || transactions.length === 0) {
      console.log('⚠️ No Voya transactions provided');
      return null;
    }

    const voyaPrice = await this.getCurrentVoyaPrice();

    // If no price available, return null
    if (!voyaPrice || voyaPrice === 0) {
      console.warn('⚠️ No Voya price available, skipping Voya holdings');
      return null;
    }

    // Calculate position from transactions
    const position = this.calculatePosition(transactions);

    // Only return holding if there are active shares
    if (position.shares <= 0) {
      console.log('⚠️ No active Voya shares');
      return null;
    }

    const marketValue = position.shares * voyaPrice;
    const gainLoss = marketValue - position.costBasis;

    return {
      fund: 'VFIAX (Voya 0899)',
      accountName: 'Voya 401(k)',
      shares: position.shares,
      latestNAV: voyaPrice,
      marketValue: marketValue,
      costBasis: position.costBasis,
      gainLoss: gainLoss,
      avgCost: position.shares > 0 ? position.costBasis / position.shares : 0,
      isVoyaLive: true, // Flag to indicate this is live Voya pricing
      priceTimestamp: this.cache.priceUpdatedAt, // When the price was last updated
    };
  }

  /**
   * Calculates the current position (shares and cost basis) from transaction history.
   * Processes buys and sells chronologically with proportional cost basis reduction for sales.
   * @private
   * @param {Array<Object>} transactions - Array of Voya transaction objects
   * @param {number} transactions[].units - Number of shares (positive for buy, negative for sell)
   * @param {number} transactions[].amount - Transaction amount in dollars
   * @param {string} transactions[].date - Transaction date (YYYY-MM-DD format)
   * @returns {{shares: number, costBasis: number}} Current position summary
   */
  calculatePosition(transactions) {
    let shares = 0;
    let costBasis = 0;

    // Sort transactions chronologically
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.date || a.activity_date || '';
      const dateB = b.date || b.activity_date || '';
      return dateA.localeCompare(dateB);
    });

    for (const tx of sorted) {
      const units = tx.units || 0;
      const amount = Math.abs(tx.amount || 0);

      if (units > 0) {
        // Buying shares
        shares += units;
        costBasis += amount;
      } else if (units < 0) {
        // Selling shares
        const sharesToRemove = Math.abs(units);
        if (shares > 0) {
          // Proportional cost basis reduction
          const avgCost = costBasis / shares;
          const costReduction = avgCost * Math.min(sharesToRemove, shares);
          costBasis = Math.max(0, costBasis - costReduction);
          shares = Math.max(0, shares - sharesToRemove);
        }
      }
    }

    console.log(`📊 Voya position calculated: ${shares.toFixed(4)} shares, $${costBasis.toFixed(2)} cost basis`);

    return {
      shares: Math.max(0, shares),
      costBasis: Math.max(0, costBasis)
    };
  }
}

export default VoyaService;
