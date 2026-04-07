/**
 * @file src/services/VoyaService.js
 * @description Service for handling live pricing of Voya 401k funds using ETF proxies.
 * Each Voya fund maps to a publicly-traded proxy ETF via a conversion ratio.
 * Uses existing price fetching infrastructure via VOYA_XXXX tickers stored in database.
 *
 * Fund proxy mapping:
 *   0899 → VOO  (Vanguard 500 Index Fund Adm)
 *   0756 → VO   (Vanguard Mid-Cap Index Fund Adm)
 *   0757 → VB   (Vanguard Small-Cap Index Fund Adm)
 *   3368 → VSS  (Vanguard Intl Explorer Fund Inv)
 */

/**
 * Configuration for each Voya 401k fund.
 * - ticker: key used in the database current_etf_prices table
 * - fundName: display name returned in holdings (format "PROXY (Voya CODE)" so
 *   Dashboard's extractTicker() can build a /fund/PROXY link)
 * - proxy: the ETF ticker used to derive the price
 *
 * @type {Object<string, {ticker: string, fundName: string, proxy: string}>}
 */
export const VOYA_FUNDS = {
  '0899': {
    ticker: 'VOYA_0899',
    fundName: 'VOO (Voya 0899)',
    proxy: 'VOO',
  },
  '0756': {
    ticker: 'VOYA_0756',
    fundName: 'VO (Voya 0756)',
    proxy: 'VO',
  },
  '0757': {
    ticker: 'VOYA_0757',
    fundName: 'VB (Voya 0757)',
    proxy: 'VB',
  },
  '3368': {
    ticker: 'VOYA_3368',
    fundName: 'VSS (Voya 3368)',
    proxy: 'VSS',
  },
};

/**
 * Extracts the 4-digit Voya fund code from a fund name string.
 * E.g. "0756 Vanguard Mid-Cap Index Fund Adm" → "0756"
 * @param {string} fundName
 * @returns {string|null}
 */
export function getVoyaFundCode(fundName) {
  const match = fundName?.match(/^(\d{4})\s/);
  return match ? match[1] : null;
}

/**
 * Returns true if the fund name belongs to any known Voya 401k fund.
 * @param {string} fundName
 * @returns {boolean}
 */
export function isVoyaFundName(fundName) {
  return getVoyaFundCode(fundName) !== null && VOYA_FUNDS[getVoyaFundCode(fundName)] !== undefined;
}

/**
 * Service class for Voya 401k live pricing and position tracking.
 * Fetches all live prices in one request and calculates current positions
 * from transaction history per fund and money source.
 */
export class VoyaService {
  /**
   * @param {string} apiUrl - Base API URL for fetching prices
   * @param {string} token - Authentication token for API requests
   */
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.cache = {
      prices: null,
      timestamp: null,
      ttl: 5 * 60 * 1000, // 5 minutes
    };
  }

  /**
   * Fetches all live ETF prices from the API, with caching.
   * @returns {Promise<Object|null>} Map of ticker → { price, updatedAt } or null on failure
   */
  async getAllPrices() {
    if (this.cache.prices && (Date.now() - this.cache.timestamp < this.cache.ttl)) {
      console.log('📦 Using cached Voya prices');
      return this.cache.prices;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/prices/latest`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch Voya prices, using cache');
        return this.cache.prices;
      }

      const data = await response.json();

      if (!data.ok || !data.prices) {
        console.warn('Invalid price response from API');
        return this.cache.prices;
      }

      this.cache.prices = data.prices;
      this.cache.timestamp = Date.now();
      console.log('📈 Fetched live Voya prices:', Object.keys(data.prices).join(', '));
      return data.prices;
    } catch (error) {
      console.error('Error fetching Voya prices:', error);
      return this.cache.prices;
    }
  }

  /**
   * Enriches Voya transaction data with live pricing to create holding objects.
   * Groups transactions by fund code and money source, applies the correct proxy
   * price for each fund, and returns one holding per (fund, money source) pair.
   *
   * @param {Array<Object>} transactions - Voya transactions from the database
   * @returns {Promise<Array<Object>>} Enriched holding objects with live pricing
   */
  async enrichVoyaHoldings(transactions) {
    if (!transactions || transactions.length === 0) {
      console.log('⚠️ No Voya transactions provided');
      return [];
    }

    const allPrices = await this.getAllPrices();

    // Group transactions by fund code, then by money source
    const byFund = {};
    for (const tx of transactions) {
      const fundName = tx.fund || tx.fund_name || '';
      const fundCode = getVoyaFundCode(fundName);

      if (!fundCode || !VOYA_FUNDS[fundCode]) {
        console.warn(`⚠️ Unknown Voya fund: "${fundName}", skipping`);
        continue;
      }

      if (!byFund[fundCode]) byFund[fundCode] = {};
      const source = tx.money_source || tx.moneySource || 'Unknown';
      if (!byFund[fundCode][source]) byFund[fundCode][source] = [];
      byFund[fundCode][source].push(tx);
    }

    const holdings = [];

    for (const [fundCode, bySource] of Object.entries(byFund)) {
      const fundConfig = VOYA_FUNDS[fundCode];
      const priceData = allPrices?.[fundConfig.ticker];
      const fundPrice = priceData?.price || 0;

      if (!fundPrice) {
        console.warn(`⚠️ No live price for ${fundConfig.ticker} — live pricing unavailable for fund ${fundCode}`);
        // TODO: Once conversion ratios are set for 0756/0757/3368, this will resolve automatically.
        // Run /api/prices/refresh?force=true after adding the ratios to prices/refresh.js
      }

      for (const [source, sourceTxs] of Object.entries(bySource)) {
        const position = this.calculatePosition(sourceTxs);

        if (position.shares <= 0) continue;

        if (!fundPrice) {
          // No live price yet — include holding with transaction-based NAV so it
          // still shows up in the portfolio with cost basis, just no live market value.
          const latestTx = [...sourceTxs].sort((a, b) => {
            const da = a.date || a.activity_date || '';
            const db = b.date || b.activity_date || '';
            return da.localeCompare(db);
          }).at(-1);
          const txPrice = latestTx?.unit_price || latestTx?.unitPrice || 0;

          holdings.push({
            fund: fundConfig.fundName,
            accountName: `Voya 401(k) (${source})`,
            shares: position.shares,
            latestNAV: txPrice,
            marketValue: position.shares * txPrice,
            costBasis: position.costBasis,
            gainLoss: (position.shares * txPrice) - position.costBasis,
            avgCost: position.shares > 0 ? position.costBasis / position.shares : 0,
            isVoyaLive: false,
            priceTimestamp: null,
          });
          continue;
        }

        const marketValue = position.shares * fundPrice;
        const gainLoss = marketValue - position.costBasis;

        holdings.push({
          fund: fundConfig.fundName,
          accountName: `Voya 401(k) (${source})`,
          shares: position.shares,
          latestNAV: fundPrice,
          marketValue,
          costBasis: position.costBasis,
          gainLoss,
          avgCost: position.shares > 0 ? position.costBasis / position.shares : 0,
          isVoyaLive: true,
          priceTimestamp: priceData?.updatedAt,
        });
      }
    }

    if (holdings.length === 0) {
      console.log('⚠️ No active Voya shares across any fund/source');
    } else {
      console.log(`✅ Created ${holdings.length} Voya holdings:`, holdings.map(h => `${h.fund} (${h.accountName})`));
    }

    return holdings;
  }

  /**
   * Calculates the current position (shares and cost basis) from transaction history.
   * Processes buys and sells chronologically with proportional cost basis reduction for sales.
   * @param {Array<Object>} transactions
   * @returns {{shares: number, costBasis: number}}
   */
  calculatePosition(transactions) {
    let shares = 0;
    let costBasis = 0;

    const sorted = [...transactions].sort((a, b) => {
      const da = a.date || a.activity_date || '';
      const db = b.date || b.activity_date || '';
      return da.localeCompare(db);
    });

    for (const tx of sorted) {
      const units = tx.units || 0;
      const amount = Math.abs(tx.amount || 0);

      if (units > 0) {
        shares += units;
        costBasis += amount;
      } else if (units < 0) {
        const sharesToRemove = Math.abs(units);
        if (shares > 0) {
          const avgCost = costBasis / shares;
          const costReduction = avgCost * Math.min(sharesToRemove, shares);
          costBasis = Math.max(0, costBasis - costReduction);
          shares = Math.max(0, shares - sharesToRemove);
        }
      }
    }

    return {
      shares: Math.max(0, shares),
      costBasis: Math.max(0, costBasis),
    };
  }
}

export default VoyaService;
