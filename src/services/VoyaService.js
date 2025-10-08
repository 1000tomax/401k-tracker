/**
 * VoyaService.js
 * Handles live pricing for Voya 401k using VFIAX as proxy
 * Uses existing price fetching infrastructure via VOYA_0899 ticker
 */

const VOYA_TICKER = 'VOYA_0899';

export class VoyaService {
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
   * Get current Voya fund price from database (via VOYA_0899 ticker)
   * @returns {Promise<number>} Current Voya fund price
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

      // Update cache
      this.cache.price = voyaPrice;
      this.cache.timestamp = Date.now();

      console.log(`📈 Fetched live Voya price: $${voyaPrice.toFixed(4)}`);
      return voyaPrice;
    } catch (error) {
      console.error('Error fetching Voya price:', error);
      return this.cache.price; // Fallback to cached price
    }
  }

  /**
   * Get Voya holdings with live pricing
   * @param {Array} transactions - Voya transactions from database
   * @returns {Promise<Object>} Voya portfolio with live pricing
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
    };
  }

  /**
   * Calculate position from Voya transactions
   * @private
   * @param {Array} transactions - Voya transactions
   * @returns {Object} Position with shares and cost basis
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
