/**
 * Dividend Service
 * Handles fetching and managing dividend income data
 */

export class DividendService {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  /**
   * Get all dividends with optional filters
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of dividends
   */
  async getAllDividends(options = {}) {
    try {
      const { sourceType, dateFrom, dateTo, fund, account, limit } = options;

      const params = new URLSearchParams();
      if (sourceType) params.append('source_type', sourceType);
      if (dateFrom) params.append('start_date', dateFrom);
      if (dateTo) params.append('end_date', dateTo);
      if (fund) params.append('fund', fund);
      if (account) params.append('account', account);
      if (limit) params.append('limit', limit);

      const url = `${this.apiUrl}/api/db/dividends?${params.toString()}`;

      console.log('📥 DividendService: Fetching dividends', { url, options });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch dividends: ${response.status}`);
      }

      const data = await response.json();

      console.log('✅ DividendService: Fetched dividends', {
        count: data.dividends?.length || 0,
        total: data.pagination?.total || 0
      });

      return data.dividends || [];
    } catch (error) {
      console.error('❌ DividendService: Failed to fetch dividends:', error);
      throw error;
    }
  }

  /**
   * Get dividends for a specific fund
   * @param {string} fund - Fund ticker/name
   * @returns {Promise<Array>} Array of dividends
   */
  async getDividendsByFund(fund) {
    return this.getAllDividends({ fund });
  }

  /**
   * Get dividends for a specific account
   * @param {string} account - Account name
   * @returns {Promise<Array>} Array of dividends
   */
  async getDividendsByAccount(account) {
    return this.getAllDividends({ account });
  }

  /**
   * Get dividend summary statistics
   * @returns {Promise<Object>} Summary statistics
   */
  async getDividendsSummary() {
    try {
      const url = `${this.apiUrl}/api/db/dividends/summary`;

      console.log('📊 DividendService: Fetching dividend summary');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch dividend summary: ${response.status}`);
      }

      const data = await response.json();

      console.log('✅ DividendService: Fetched dividend summary', data);

      return data;
    } catch (error) {
      console.error('❌ DividendService: Failed to fetch dividend summary:', error);
      throw error;
    }
  }

  /**
   * Get dividends within a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of dividends
   */
  async getDividendsByDateRange(startDate, endDate) {
    return this.getAllDividends({
      dateFrom: startDate,
      dateTo: endDate
    });
  }

  /**
   * Calculate dividend totals by fund
   * @param {Array} dividends - Array of dividend records
   * @returns {Object} Totals by fund
   */
  aggregateByFund(dividends) {
    const byFund = {};

    for (const dividend of dividends) {
      const fund = dividend.fund || 'Unknown';
      if (!byFund[fund]) {
        byFund[fund] = {
          fund,
          totalAmount: 0,
          count: 0,
          firstPayment: dividend.date,
          lastPayment: dividend.date,
          payments: []
        };
      }

      byFund[fund].totalAmount += parseFloat(dividend.amount) || 0;
      byFund[fund].count += 1;
      byFund[fund].payments.push(dividend);

      if (dividend.date < byFund[fund].firstPayment) {
        byFund[fund].firstPayment = dividend.date;
      }
      if (dividend.date > byFund[fund].lastPayment) {
        byFund[fund].lastPayment = dividend.date;
      }
    }

    return byFund;
  }

  /**
   * Calculate dividend totals by account
   * @param {Array} dividends - Array of dividend records
   * @returns {Object} Totals by account
   */
  aggregateByAccount(dividends) {
    const byAccount = {};

    for (const dividend of dividends) {
      const account = dividend.account || 'Unknown';
      if (!byAccount[account]) {
        byAccount[account] = {
          account,
          totalAmount: 0,
          count: 0,
          funds: new Set(),
          payments: []
        };
      }

      byAccount[account].totalAmount += parseFloat(dividend.amount) || 0;
      byAccount[account].count += 1;
      byAccount[account].funds.add(dividend.fund);
      byAccount[account].payments.push(dividend);
    }

    // Convert Set to Array for JSON serialization
    for (const account in byAccount) {
      byAccount[account].funds = Array.from(byAccount[account].funds);
    }

    return byAccount;
  }

  /**
   * Calculate dividend totals by month
   * @param {Array} dividends - Array of dividend records
   * @returns {Array} Monthly totals with running average
   */
  aggregateByMonth(dividends) {
    const byMonth = new Map();

    for (const dividend of dividends) {
      // Parse date as local date to avoid timezone shifts
      const [year, month, day] = dividend.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, {
          month: monthKey,
          totalAmount: 0,
          count: 0,
          payments: []
        });
      }

      const monthData = byMonth.get(monthKey);
      monthData.totalAmount += parseFloat(dividend.amount) || 0;
      monthData.count += 1;
      monthData.payments.push(dividend);
    }

    // Convert to array and sort by month
    const sorted = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Calculate running average for each month
    let cumulativeTotal = 0;
    return sorted.map((monthData, index) => {
      cumulativeTotal += monthData.totalAmount;
      const runningAvg = cumulativeTotal / (index + 1);

      return {
        month: monthData.month,
        totalAmount: monthData.totalAmount,
        count: monthData.count,
        runningAvg: runningAvg,
        payments: monthData.payments
      };
    });
  }

  /**
   * Calculate year-to-date dividend total
   * @param {Array} dividends - Array of dividend records
   * @returns {number} YTD total
   */
  calculateYTD(dividends) {
    const currentYear = new Date().getFullYear();
    const ytdDividends = dividends.filter(d => {
      const [year] = d.date.split('-').map(Number);
      return year === currentYear;
    });

    return ytdDividends.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  }

  /**
   * Calculate trailing 12 months dividend total
   * @param {Array} dividends - Array of dividend records
   * @returns {number} TTM total
   */
  calculateTTM(dividends) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const ttmDividends = dividends.filter(d => {
      const [year, month, day] = d.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date >= oneYearAgo;
    });

    return ttmDividends.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  }

  /**
   * Calculate cumulative dividend timeline
   * @param {Array} dividends - Array of dividend records (must be sorted by date)
   * @returns {Array} Timeline with cumulative totals
   */
  calculateCumulativeTimeline(dividends) {
    if (dividends.length === 0) return [];

    const sorted = [...dividends].sort((a, b) => a.date.localeCompare(b.date));

    // Determine date range to decide aggregation strategy
    const firstDate = new Date(sorted[0].date);
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const daysDiff = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));

    // Decide aggregation: daily (< 90 days), weekly (< 365 days), monthly (>= 365 days)
    let groupBy = 'day';
    if (daysDiff >= 365) {
      groupBy = 'month';
    } else if (daysDiff >= 90) {
      groupBy = 'week';
    }

    // Build cumulative timeline with smart aggregation
    let cumulative = 0;
    const grouped = new Map();

    for (const dividend of sorted) {
      cumulative += parseFloat(dividend.amount) || 0;

      let key;
      const [year, month, day] = dividend.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      if (groupBy === 'month') {
        // Group by month (YYYY-MM)
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'week') {
        // Group by week (start of week)
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Sunday
        key = weekStart.toISOString().split('T')[0];
      } else {
        // Group by day
        key = dividend.date;
      }

      // Store the latest cumulative value for this period, tracking funds that paid
      const existing = grouped.get(key);
      grouped.set(key, {
        date: key,
        cumulative: cumulative,
        amount: (existing?.amount || 0) + parseFloat(dividend.amount),
        funds: existing?.funds ? [...existing.funds, dividend.fund] : [dividend.fund],
      });
    }

    return Array.from(grouped.values());
  }

  /**
   * Detect payment frequency for each fund based on historical patterns
   * @param {Array} dividends - Array of dividend records
   * @returns {Object} Map of fund -> frequency ('Monthly', 'Quarterly', 'Annual', or null)
   */
  detectPaymentFrequencies(dividends) {
    const byFund = this.aggregateByFund(dividends);
    const frequencies = {};

    for (const [fund, data] of Object.entries(byFund)) {
      if (data.count < 2) {
        frequencies[fund] = null; // Not enough data
        continue;
      }

      // Sort payments by date
      const sorted = [...data.payments].sort((a, b) => a.date.localeCompare(b.date));

      // Calculate average days between payments
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) {
        const date1 = new Date(sorted[i - 1].date);
        const date2 = new Date(sorted[i].date);
        const daysDiff = Math.ceil((date2 - date1) / (1000 * 60 * 60 * 24));
        gaps.push(daysDiff);
      }

      if (gaps.length === 0) {
        frequencies[fund] = null;
        continue;
      }

      const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

      // Classify based on average gap
      if (avgGap < 45) {
        frequencies[fund] = 'Monthly';
      } else if (avgGap < 180) {
        frequencies[fund] = 'Quarterly';
      } else {
        frequencies[fund] = 'Annual';
      }
    }

    return frequencies;
  }

  /**
   * Calculate dividend yield for each fund
   * @param {Array} dividends - Array of dividend records
   * @param {Object} prices - Map of ticker -> {price, changePercent, updatedAt}
   * @returns {Object} Map of fund -> yield percentage (or null if price unavailable)
   */
  calculateYields(dividends, prices = {}) {
    const byFund = this.aggregateByFund(dividends);
    const ttm = this.calculateTTM(dividends);
    const ttmByFund = {};

    // Calculate TTM for each fund
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    for (const dividend of dividends) {
      const [year, month, day] = dividend.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      if (date >= oneYearAgo) {
        const fund = dividend.fund;
        ttmByFund[fund] = (ttmByFund[fund] || 0) + (parseFloat(dividend.amount) || 0);
      }
    }

    const yields = {};

    for (const [fund, data] of Object.entries(byFund)) {
      const ticker = fund.toUpperCase().trim();
      const priceData = prices[ticker];

      if (!priceData || !priceData.price || priceData.price <= 0) {
        yields[fund] = null;
        continue;
      }

      const annualDividend = ttmByFund[fund] || 0;
      const price = priceData.price;

      // Yield = (Annual Dividend / Price) × 100
      yields[fund] = annualDividend > 0 ? (annualDividend / price) * 100 : 0;
    }

    return yields;
  }

  /**
   * Calculate projected annual dividend income
   * @param {Array} dividends - Array of dividend records
   * @returns {number} Projected annual income based on TTM
   */
  calculateProjectedAnnual(dividends) {
    // Use TTM as baseline projection (conservative estimate)
    return this.calculateTTM(dividends);
  }
}

export default DividendService;
