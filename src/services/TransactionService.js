/**
 * Transaction Service
 * Handles fetching and managing transactions from database
 */

export class TransactionService {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  /**
   * Get all transactions from database
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of transactions
   */
  async getAllTransactions(options = {}) {
    try {
      const { sourceType, dateFrom, dateTo, fund, limit, moneySource } = options;

      const params = new URLSearchParams();
      if (sourceType) params.append('source_type', sourceType);
      if (dateFrom) params.append('start_date', dateFrom);
      if (dateTo) params.append('end_date', dateTo);
      if (fund) params.append('fund', fund);
      if (limit) params.append('limit', limit);
      if (moneySource) params.append('money_source', moneySource);

      const url = `${this.apiUrl}/api/db/transactions?${params.toString()}`;

      console.log('📥 TransactionService: Fetching transactions', { url, options });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch transactions: ${response.status}`);
      }

      const data = await response.json();

      console.log('✅ TransactionService: Fetched transactions', {
        count: data.transactions?.length || 0,
        total: data.pagination?.total || 0
      });

      return data.transactions || [];
    } catch (error) {
      console.error('❌ TransactionService: Failed to fetch transactions:', error);
      throw error;
    }
  }

  /**
   * Get transactions for a specific account
   * @param {string} sourceId - Source ID (account identifier)
   * @returns {Promise<Array>} Array of transactions
   */
  async getTransactionsByAccount(sourceId) {
    try {
      const params = new URLSearchParams({ source_id: sourceId });
      const url = `${this.apiUrl}/api/db/transactions?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-401K-Token': this.token,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`);
      }

      const data = await response.json();
      return data.transactions || [];
    } catch (error) {
      console.error('❌ TransactionService: Failed to fetch account transactions:', error);
      throw error;
    }
  }

  /**
   * Get transactions by source type (plaid, voya, manual)
   * @param {string} sourceType - Source type
   * @returns {Promise<Array>} Array of transactions
   */
  async getTransactionsBySource(sourceType) {
    return this.getAllTransactions({ sourceType });
  }

  /**
   * Get transactions within a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of transactions
   */
  async getTransactionsByDateRange(startDate, endDate) {
    return this.getAllTransactions({
      dateFrom: startDate,
      dateTo: endDate
    });
  }
}

export default TransactionService;
