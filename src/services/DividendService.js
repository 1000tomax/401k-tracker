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
   * @returns {Array} Monthly totals
   */
  aggregateByMonth(dividends) {
    const byMonth = new Map();

    for (const dividend of dividends) {
      const date = new Date(dividend.date);
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
    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Calculate year-to-date dividend total
   * @param {Array} dividends - Array of dividend records
   * @returns {number} YTD total
   */
  calculateYTD(dividends) {
    const currentYear = new Date().getFullYear();
    const ytdDividends = dividends.filter(d => {
      const year = new Date(d.date).getFullYear();
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
      const date = new Date(d.date);
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
    const sorted = [...dividends].sort((a, b) => a.date.localeCompare(b.date));
    let cumulative = 0;
    const timeline = [];

    for (const dividend of sorted) {
      cumulative += parseFloat(dividend.amount) || 0;
      timeline.push({
        date: dividend.date,
        amount: parseFloat(dividend.amount) || 0,
        cumulative: cumulative,
        fund: dividend.fund,
        account: dividend.account
      });
    }

    return timeline;
  }
}

export default DividendService;
